"""Blockbench helper: check a .bbmodel against ART_SPEC.md and convert it to .glb.

    python3 tools/bbmodel.py assets/sources/enemy_insurgent.bbmodel assets/characters/enemy_insurgent.glb
    python3 tools/bbmodel.py assets/sources/enemy_insurgent.bbmodel          (check only)

Units: 1 Blockbench unit = 1 texture pixel = 1/32 m (ART_SPEC.md, section 2);
weapons and first-person hands 1/256 m (section 5), picked from the output folder.
Blockbench's own File → Export → glTF works too (export scale 32); this script is a
fallback and what Claude uses to check files.
"""
import base64, json, math, struct, sys

UNITS_PER_M = 32

# Faces: outward normal, and the four corners as (x, y, z) picks from (min, max) in the
# order top-left, top-right, bottom-right, bottom-left as seen from outside, matching
# Blockbench's UV layout (u to the right, v down).
FACES = {
    'north': ((0, 0, -1), [(1, 1, 0), (0, 1, 0), (0, 0, 0), (1, 0, 0)]),
    'south': ((0, 0, 1), [(0, 1, 1), (1, 1, 1), (1, 0, 1), (0, 0, 1)]),
    'east': ((1, 0, 0), [(1, 1, 1), (1, 1, 0), (1, 0, 0), (1, 0, 1)]),
    'west': ((-1, 0, 0), [(0, 1, 0), (0, 1, 1), (0, 0, 1), (0, 0, 0)]),
    'up': ((0, 1, 0), [(0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)]),
    'down': ((0, -1, 0), [(0, 0, 1), (1, 0, 1), (1, 0, 0), (0, 0, 0)]),
}


def rot_matrix(deg):
    """Blockbench element/group rotation [x, y, z] in degrees (applied Z, then Y, then X)."""
    rx, ry, rz = (math.radians(a) for a in deg)
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    X = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
    Y = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
    Z = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]
    mul = lambda A, B: [[sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    return mul(mul(X, Y), Z)


def apply(M, v):
    return [sum(M[i][k] * v[k] for k in range(3)) for i in range(3)]


def load(path):
    bb = json.load(open(path, encoding='utf-8'))
    elements = {e['uuid']: e for e in bb.get('elements', [])}
    groups = {g['uuid']: g for g in bb.get('groups', [])}  # newer files keep groups here
    return bb, elements, groups


def walk(bb, elements, groups):
    """Yield the outliner as a tree: {'name', 'origin', 'rotation', 'cubes': [...], 'children': [...]}"""
    def node(item):
        if isinstance(item, str):
            if item in elements:
                return ('cube', elements[item])
            if item in groups:
                g = dict(groups[item]); g.setdefault('children', [])
                return node(g)
            return None
        g = dict(item)
        if 'children' in g and not isinstance(g.get('children'), list):
            g['children'] = []
        if g.get('uuid') in groups and not g.get('origin'):
            g = {**groups[g['uuid']], **g}
        kids = [node(c) for c in g.get('children', [])]
        return ('group', {'name': g.get('name', 'group'), 'origin': g.get('origin', [0, 0, 0]),
                          'rotation': g.get('rotation', [0, 0, 0]), 'visibility': g.get('visibility', True),
                          'children': [k for k in kids if k]})
    return [n for n in (node(i) for i in bb.get('outliner', [])) if n]


def triangles(bb):
    n = 0
    for e in bb.get('elements', []):
        if e.get('type', 'cube') == 'cube':
            n += 2 * sum(1 for f in e.get('faces', {}).values() if f and f.get('texture') is not None)
        elif e.get('type') == 'mesh':
            for f in e.get('faces', {}).values():
                n += max(0, len(f.get('vertices', [])) - 2)
    return n


def names(tree):
    out = []
    for kind, n in tree:
        if kind == 'group':
            out.append(n['name']); out += names(n['children'])
        else:
            out.append(n.get('name', ''))
    return out


def to_glb(path_in, path_out, units_per_m=None):
    """units_per_m: 32 for characters, items and blocks; 256 for weapons and first-person hands."""
    if units_per_m is None:
        units_per_m = 256 if ('/weapons/' in path_out.replace('\\', '/') or 'player_hands' in path_out) else UNITS_PER_M
    bb, elements, groups = load(path_in)
    tree = walk(bb, elements, groups)
    tex = (bb.get('textures') or [None])[0]
    tw = (tex or {}).get('uv_width') or bb.get('resolution', {}).get('width', 16)
    th = (tex or {}).get('uv_height') or bb.get('resolution', {}).get('height', 16)
    s = 1 / units_per_m

    nodes, meshes, accessors, views = [], [], [], []
    blob = bytearray()

    def add_view(data, target=None):
        while len(blob) % 4:
            blob.append(0)
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data), **({'target': target} if target else {})})
        blob.extend(data)
        return len(views) - 1

    def add_acc(fmt, rows, comp, typ, target, minmax=False):
        data = b''.join(struct.pack(fmt, *r) if isinstance(r, (list, tuple)) else struct.pack(fmt, r) for r in rows)
        acc = {'bufferView': add_view(data, target), 'componentType': comp, 'count': len(rows), 'type': typ}
        if minmax:
            acc['min'] = [min(r[i] for r in rows) for i in range(3)]
            acc['max'] = [max(r[i] for r in rows) for i in range(3)]
        accessors.append(acc)
        return len(accessors) - 1

    def cube_mesh(e, parent_origin):
        """Mesh in the parent group's space (positions relative to the group's pivot)."""
        f0, t0 = e['from'], e['to']
        infl = e.get('inflate', 0)
        lo = [min(f0[i], t0[i]) - infl for i in range(3)]
        hi = [max(f0[i], t0[i]) + infl for i in range(3)]
        R = rot_matrix(e.get('rotation', [0, 0, 0]))
        o = e.get('origin', [0, 0, 0])
        pos, nor, uv, idx = [], [], [], []
        for face, (n, corners) in FACES.items():
            fd = e.get('faces', {}).get(face)
            if not fd or fd.get('texture') is None:
                continue
            u1, v1, u2, v2 = fd.get('uv', [0, 0, 0, 0])
            quad_uv = [(u1, v1), (u2, v1), (u2, v2), (u1, v2)]
            r = int(fd.get('rotation', 0) or 0) // 90
            quad_uv = quad_uv[-r:] + quad_uv[:-r] if r else quad_uv
            base = len(pos)
            for (cx, cy, cz), (u, v) in zip(corners, quad_uv):
                p = [(lo, hi)[cx][0], (lo, hi)[cy][1], (lo, hi)[cz][2]]
                p = apply(R, [p[i] - o[i] for i in range(3)])
                p = [p[i] + o[i] - parent_origin[i] for i in range(3)]
                pos.append([c * s for c in p]); nor.append(apply(R, list(n))); uv.append([u / tw, v / th])
            idx += [base, base + 2, base + 1, base, base + 3, base + 2]
        if not pos:
            return None
        prim = {'attributes': {'POSITION': add_acc('<3f', pos, 5126, 'VEC3', 34962, True),
                               'NORMAL': add_acc('<3f', nor, 5126, 'VEC3', 34962),
                               'TEXCOORD_0': add_acc('<2f', uv, 5126, 'VEC2', 34962)},
                'indices': add_acc('<H', idx, 5123, 'SCALAR', 34963)}
        if tex:
            prim['material'] = 0
        meshes.append({'name': e.get('name', 'cube'), 'primitives': [prim]})
        return len(meshes) - 1

    def emit(kind, n, parent_origin):
        if kind == 'cube':
            m = cube_mesh(n, parent_origin)
            if m is None:
                return None
            nodes.append({'name': n.get('name', 'cube'), 'mesh': m})
            return len(nodes) - 1
        o = n['origin']
        node = {'name': n['name'], 'translation': [(o[i] - parent_origin[i]) * s for i in range(3)]}
        if any(n['rotation']):
            rx, ry, rz = (math.radians(a) / 2 for a in n['rotation'])
            # X·Y·Z rotation as a quaternion
            qx = [math.sin(rx), 0, 0, math.cos(rx)]; qy = [0, math.sin(ry), 0, math.cos(ry)]; qz = [0, 0, math.sin(rz), math.cos(rz)]
            def qm(a, b):
                return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
                        a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]]
            node['rotation'] = qm(qm(qx, qy), qz)
        nodes.append(node)
        me = len(nodes) - 1
        kids = [emit(k, c, o) for k, c in n['children']]
        kids = [k for k in kids if k is not None]
        if kids:
            nodes[me]['children'] = kids
        return me

    roots = [r for r in (emit(k, n, [0, 0, 0]) for k, n in tree) if r is not None]
    gltf = {'asset': {'version': '2.0', 'generator': 'warehouse-7 tools/bbmodel.py'},
            'scene': 0, 'scenes': [{'nodes': roots}], 'nodes': nodes, 'meshes': meshes,
            'accessors': accessors, 'bufferViews': views}
    if tex:
        src = tex.get('source', '')
        png = base64.b64decode(src.split(',', 1)[1]) if src.startswith('data:') else open(tex['path'], 'rb').read()
        img_view = add_view(png)
        gltf.update({'images': [{'bufferView': img_view, 'mimeType': 'image/png'}],
                     'samplers': [{'magFilter': 9728, 'minFilter': 9728}],
                     'textures': [{'source': 0, 'sampler': 0}],
                     'materials': [{'name': 'skin', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 1}}]})
    gltf['bufferViews'] = views
    gltf['buffers'] = [{'byteLength': len(blob)}]
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    blob += b'\0' * (-len(blob) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    open(path_out, 'wb').write(out)
    return len(out)


if __name__ == '__main__':
    src = sys.argv[1]
    bb, el, gr = load(src)
    tree = walk(bb, el, gr)
    print(f'{src}: {triangles(bb)} triangles; parts: {", ".join(n for n in names(tree) if n)}')
    if len(sys.argv) > 2:
        print('wrote', sys.argv[2], to_glb(src, sys.argv[2]), 'bytes')
