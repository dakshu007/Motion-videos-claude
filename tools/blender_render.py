"""Render a scene exported by src/blender-export.js with Blender Cycles.

  python tools/blender_render.py <export_dir> <frames_out_dir> [--samples 24] [--step 2] [--only 0,40]

Needs the `bpy` module (pip install bpy, Python 3.13). Reads <export_dir>/scene.json and
<export_dir>/frames/NNNNN.json (per-frame diffs) and writes <frames_out_dir>/NNNNN.jpg.
Frames already on disk are skipped, so an interrupted render resumes. With --step 2 every
other frame is rendered and the next one is a copy (claymation "on twos").
"""
import argparse, base64, json, math, os, sys, time
import numpy as np
import bpy
from mathutils import Matrix, Vector

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('out')
ap.add_argument('--samples', type=int, default=24)
ap.add_argument('--step', type=int, default=1)
ap.add_argument('--only', default='')
ap.add_argument('--scale', type=float, default=1.0)
ap.add_argument('--threads', type=int, default=0)
A = ap.parse_args()
# Cycles' occluded bounce light reads darker than three.js' flat ambient; lift to match.
EXPOSURE = float(os.environ.get('BLENDER_EXPOSURE', 1.0))
SHEEN = float(os.environ.get('BLENDER_SHEEN', 0.3))

SRC, OUT = A.src, A.out
os.makedirs(OUT, exist_ok=True)
S = json.load(open(os.path.join(SRC, 'scene.json')))
C = Matrix.Rotation(math.radians(90), 4, 'X')  # three (Y up) -> blender (Z up)


def m4(e):
    return Matrix(((e[0], e[4], e[8], e[12]), (e[1], e[5], e[9], e[13]), (e[2], e[6], e[10], e[14]), (e[3], e[7], e[11], e[15])))


def v3(p):
    return C @ Vector(p)


def arr(s, dt=np.float32):
    return np.frombuffer(base64.b64decode(s), dtype=dt)


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
coll = scene.collection

# ---- textures ---------------------------------------------------------------
TEXDIR = os.path.join(SRC, 'tex')
images = {}


def image(path, srgb=True):
    key = (path, srgb)
    if key not in images:
        img = bpy.data.images.load(path, check_existing=False)
        img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
        img.alpha_mode = 'STRAIGHT'
        images[key] = img
    return images[key]


tex_nodes = {}  # texture id -> [image nodes]
tex_info = S['textures']


def tex_node(nt, tid, srgb=None):
    t = tex_info[tid]
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = image(os.path.join(TEXDIR, t['file']), t['srgb'] if srgb is None else srgb)
    n.extension = 'REPEAT' if t['wrap'] else 'EXTEND'
    n.interpolation = 'Linear'
    if t['repeat'] != [1, 1] or t['offset'] != [0, 0] or not t['flipY']:
        uv = nt.nodes.new('ShaderNodeTexCoord')
        mp = nt.nodes.new('ShaderNodeMapping')
        sy = t['repeat'][1] * (1 if t['flipY'] else -1)
        mp.inputs['Scale'].default_value = (t['repeat'][0], sy, 1)
        mp.inputs['Location'].default_value = (t['offset'][0], t['offset'][1] + (0 if t['flipY'] else 1), 0)
        nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])
        nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
    tex_nodes.setdefault(tid, []).append(n)
    return n


# ---- materials --------------------------------------------------------------
mats = {}
mat_nodes = {}  # id -> dict of nodes whose values follow the per-frame state


def build_material(mid, d, geo_type):
    m = bpy.data.materials.new(mid)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    rgb = nt.nodes.new('ShaderNodeRGB')
    rgb.outputs[0].default_value = (*d['color'], 1) if d['color'] else (1, 1, 1, 1)
    base = rgb.outputs[0]
    alpha = None
    if d['map']:
        tn = tex_node(nt, d['map'])
        mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
        mul.inputs['Factor'].default_value = 1
        nt.links.new(rgb.outputs[0], mul.inputs['A']); nt.links.new(tn.outputs['Color'], mul.inputs['B'])
        base = mul.outputs['Result']
        if d['transparent'] or d['alphaTest']:
            alpha = tn.outputs['Alpha']
    nodes = {'rgb': rgb}
    if d['kind'] == 'basic':
        em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(base, em.inputs['Color'])
        em.inputs['Strength'].default_value = 1.0
        shader = em.outputs[0]
    else:
        b = nt.nodes.new('ShaderNodeBsdfPrincipled')
        nt.links.new(base, b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = d['roughness'] if d['roughness'] is not None else 0.5
        b.inputs['Metallic'].default_value = d['metalness'] or 0
        if d['sheen']:
            b.inputs['Sheen Weight'].default_value = min(1, d['sheen'] * SHEEN)  # Cycles sheen is much stronger than three.js'
            if d['sheenColor']:
                b.inputs['Sheen Tint'].default_value = (*d['sheenColor'], 1)
            if d['sheenRoughness'] is not None:
                b.inputs['Sheen Roughness'].default_value = d['sheenRoughness']
        if d['transmission']:
            b.inputs['Transmission Weight'].default_value = d['transmission']
            b.inputs['IOR'].default_value = d['ior']
        if d['clearcoat']:
            b.inputs['Coat Weight'].default_value = d['clearcoat']
            b.inputs['Coat Roughness'].default_value = d['clearcoatRoughness']
        if d['emissive'] and max(d['emissive']) > 0 and d['emissiveIntensity']:
            b.inputs['Emission Color'].default_value = (*d['emissive'], 1)
            b.inputs['Emission Strength'].default_value = d['emissiveIntensity']
            if d['emissiveMap']:
                et = tex_node(nt, d['emissiveMap'])
                nt.links.new(et.outputs['Color'], b.inputs['Emission Color'])
        if d['bumpMap']:
            bt = tex_node(nt, d['bumpMap'], srgb=False)
            bump = nt.nodes.new('ShaderNodeBump')
            bump.inputs['Strength'].default_value = min(1.0, 0.25 * d['bumpScale'])
            bump.inputs['Distance'].default_value = 0.002
            nt.links.new(bt.outputs['Color'], bump.inputs['Height'])
            nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
        # Clay look: a little light scattering in skin and in the mascot's body.
        if d['name'] == 'skin':
            b.inputs['Subsurface Weight'].default_value = 0.35
            b.inputs['Subsurface Radius'].default_value = (1.0, 0.45, 0.3)
            b.inputs['Subsurface Scale'].default_value = 0.012
            b.inputs['Roughness'].default_value = 0.55
        elif d['name'] == 'mascot':
            b.inputs['Subsurface Weight'].default_value = 0.2
            b.inputs['Subsurface Radius'].default_value = (1.0, 0.5, 0.35)
            b.inputs['Subsurface Scale'].default_value = 0.01
        nodes['bsdf'] = b
        shader = b.outputs[0]
    # Opacity / cut-out alpha
    op = d['opacity'] if d['transparent'] else 1.0
    if alpha is not None or op < 1:
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mix = nt.nodes.new('ShaderNodeMixShader')
        fac = None
        if alpha is not None:
            fac = alpha
            if op < 1:
                mm = nt.nodes.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'
                nt.links.new(alpha, mm.inputs[0]); mm.inputs[1].default_value = op
                fac = mm.outputs[0]
                nodes['opmul'] = mm
        if fac is not None:
            nt.links.new(fac, mix.inputs['Fac'])
        else:
            mix.inputs['Fac'].default_value = op
            nodes['opmix'] = mix
        nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(shader, mix.inputs[2])
        shader = mix.outputs[0]
    # Single-sided planes (three.js FrontSide) disappear when seen from behind.
    if d['side'] == 0 and geo_type in ('PlaneGeometry', 'CircleGeometry', 'RingGeometry'):
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        tr2 = nt.nodes.new('ShaderNodeBsdfTransparent')
        mix2 = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(geo.outputs['Backfacing'], mix2.inputs['Fac'])
        nt.links.new(shader, mix2.inputs[1]); nt.links.new(tr2.outputs[0], mix2.inputs[2])
        shader = mix2.outputs[0]
    nt.links.new(shader, out.inputs['Surface'])
    mat_nodes[mid] = nodes
    return m


def set_mat_state(mid, val):
    color, opacity, emissive, ei = val
    n = mat_nodes.get(mid)
    if not n:
        return
    if color:
        n['rgb'].outputs[0].default_value = (*color, 1)
    if 'opmix' in n:
        n['opmix'].inputs['Fac'].default_value = opacity
    if 'opmul' in n:
        n['opmul'].inputs[1].default_value = opacity
    b = n.get('bsdf')
    if b and emissive and ei and max(emissive) > 0:
        b.inputs['Emission Color'].default_value = (*emissive, 1)
        b.inputs['Emission Strength'].default_value = ei


# ---- meshes + objects -------------------------------------------------------
meshes = {}
geo_type = {}
for gid, g in S['geoms'].items():
    pos = arr(g['pos']).reshape(-1, 3)
    nrm = arr(g['nrm']).reshape(-1, 3)
    idx = arr(g['idx'], np.uint32)
    ntri = len(idx) // 3
    me = bpy.data.meshes.new(gid)
    me.vertices.add(len(pos))
    me.vertices.foreach_set('co', pos.ravel())
    me.loops.add(len(idx))
    me.loops.foreach_set('vertex_index', idx.astype(np.int32))
    me.polygons.add(ntri)
    me.polygons.foreach_set('loop_start', (np.arange(ntri, dtype=np.int32) * 3))
    if g['uv']:
        uv = arr(g['uv']).reshape(-1, 2)
        layer = me.uv_layers.new(name='UVMap')
        layer.data.foreach_set('uv', uv[idx].ravel())
    me.update(calc_edges=True)
    me.validate(clean_customdata=False)
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), dtype=bool))
    try:
        me.normals_split_custom_set_from_vertices([tuple(n) for n in nrm])
    except Exception as ex:
        print('normals failed', gid, ex)
    meshes[gid] = me
    geo_type[gid] = g.get('type', '')

objects = {}
for od in S['objects']:
    md = S['materials'][od['mat']]
    if md['kind'] == 'shadow':
        key = od['mat'] + ':shadow'
    else:
        key = od['mat'] + ('' if md['side'] != 0 or geo_type[od['geo']] not in ('PlaneGeometry', 'CircleGeometry', 'RingGeometry') else ':1s')
    if key not in mats:
        mats[key] = build_material(od['mat'], md, geo_type[od['geo']] if key.endswith(':1s') else '')
    me = meshes[od['geo']]
    ob = bpy.data.objects.new(od['name'], me)
    if not me.materials:
        me.materials.append(None)
    ob.material_slots[0].link = 'OBJECT'
    ob.material_slots[0].material = mats[key]
    if md['kind'] == 'shadow':
        ob.is_shadow_catcher = True
    if md['kind'] == 'basic':
        ob.visible_shadow = False
    coll.objects.link(ob)
    objects[od['name']] = ob

# ---- lights -----------------------------------------------------------------
lights = {}
hemi = {'c': [1, 1, 1], 'g': [0.3, 0.3, 0.3], 'i': 0}
for ld in S['lights']:
    t = ld['type']
    if t == 'HemisphereLight':
        continue
    kind = 'SUN' if t == 'DirectionalLight' else 'POINT' if t == 'PointLight' else 'SPOT' if t == 'SpotLight' else None
    if not kind:
        continue
    data = bpy.data.lights.new(ld['name'], kind)
    ob = bpy.data.objects.new(ld['name'], data)
    coll.objects.link(ob)
    lights[ld['name']] = (ob, t)

RIM = float(os.environ.get('BLENDER_RIM', 1.8))
FILL = float(os.environ.get('BLENDER_FILL', 0.8))


def set_light(name, v):
    if name not in lights:
        if v.get('g') is not None:
            hemi.update(v)
        return
    ob, t = lights[name]
    p = v3(v['p'])
    if t == 'DirectionalLight':
        tgt = v3(v['t'])
        d = (tgt - p).normalized()
        ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        ob.location = p
        ob.data.color = v['c']
        # Key casts a soft-edged shadow, the rim (from behind) draws a bright edge, the fill is broad.
        if v.get('s'):
            ob.data.energy = v['i']; ob.data.angle = math.radians(5)
        elif v['p'][2] < v['t'][2]:
            ob.data.energy = v['i'] * RIM; ob.data.angle = math.radians(8)
        else:
            ob.data.energy = v['i'] * FILL; ob.data.angle = math.radians(30)
    else:
        ob.location = p
        dist = 1.0
        ob.data.energy = v['i'] * 4 * math.pi * math.pi * 0.6 * dist
        ob.data.color = v['c']
        ob.data.shadow_soft_size = 0.08
        ob.data.use_custom_distance = bool(v.get('d'))
        if v.get('d'):
            ob.data.cutoff_distance = v['d'] * 1.5


# ---- world: sky gradient for camera rays, hemisphere light for lighting -----
world = bpy.data.worlds.new('world')
scene.world = world
world.use_nodes = True
wn = world.node_tree
for n in list(wn.nodes):
    wn.nodes.remove(n)
W = {}


def wnode(t, **kw):
    n = wn.nodes.new(t)
    for k, v in kw.items():
        setattr(n, k, v)
    return n


tc = wnode('ShaderNodeTexCoord')
sep = wnode('ShaderNodeSeparateXYZ')
wn.links.new(tc.outputs['Generated'], sep.inputs[0])
# elevation -> 0..1 the same way the three.js sky shader does it
asin = wnode('ShaderNodeMath', operation='ARCSINE')
wn.links.new(sep.outputs['Z'], asin.inputs[0])
y = wnode('ShaderNodeMapRange', clamp=True)
y.inputs['From Min'].default_value = -0.35; y.inputs['From Max'].default_value = 0.9
wn.links.new(asin.outputs[0], y.inputs['Value'])
s1 = wnode('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP')
s1.inputs['From Min'].default_value = 0; s1.inputs['From Max'].default_value = 0.45
wn.links.new(y.outputs[0], s1.inputs['Value'])
s2 = wnode('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP')
s2.inputs['From Min'].default_value = 0.4; s2.inputs['From Max'].default_value = 1
wn.links.new(y.outputs[0], s2.inputs['Value'])
W['hor'] = wnode('ShaderNodeRGB'); W['mid'] = wnode('ShaderNodeRGB'); W['top'] = wnode('ShaderNodeRGB')
mx1 = wnode('ShaderNodeMix', data_type='RGBA')
wn.links.new(s1.outputs[0], mx1.inputs['Factor']); wn.links.new(W['hor'].outputs[0], mx1.inputs['A']); wn.links.new(W['mid'].outputs[0], mx1.inputs['B'])
mx2 = wnode('ShaderNodeMix', data_type='RGBA')
wn.links.new(s2.outputs[0], mx2.inputs['Factor']); wn.links.new(mx1.outputs['Result'], mx2.inputs['A']); wn.links.new(W['top'].outputs[0], mx2.inputs['B'])
# sun glow
W['sundir'] = wnode('ShaderNodeCombineXYZ')
dot = wnode('ShaderNodeVectorMath', operation='DOT_PRODUCT')
wn.links.new(tc.outputs['Generated'], dot.inputs[0]); wn.links.new(W['sundir'].outputs[0], dot.inputs[1])
acos = wnode('ShaderNodeMath', operation='ARCCOSINE', use_clamp=True)
wn.links.new(dot.outputs['Value'], acos.inputs[0])
k = wnode('ShaderNodeMath', operation='MULTIPLY'); k.inputs[1].default_value = -4.8
wn.links.new(acos.outputs[0], k.inputs[0])
ex = wnode('ShaderNodeMath', operation='EXPONENT')
wn.links.new(k.outputs[0], ex.inputs[0])
W['glow'] = wnode('ShaderNodeMath', operation='MULTIPLY')
wn.links.new(ex.outputs[0], W['glow'].inputs[0])
W['sun'] = wnode('ShaderNodeRGB')
sunmul = wnode('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
sunmul.inputs['Factor'].default_value = 1
wn.links.new(W['sun'].outputs[0], sunmul.inputs['A'])
glowc = wnode('ShaderNodeCombineColor')
for ch in ('Red', 'Green', 'Blue'):
    wn.links.new(W['glow'].outputs[0], glowc.inputs[ch])
wn.links.new(glowc.outputs[0], sunmul.inputs['B'])
add = wnode('ShaderNodeMix', data_type='RGBA', blend_type='ADD')
add.inputs['Factor'].default_value = 1
wn.links.new(mx2.outputs['Result'], add.inputs['A']); wn.links.new(sunmul.outputs['Result'], add.inputs['B'])
sky_bg = wnode('ShaderNodeBackground')
wn.links.new(add.outputs['Result'], sky_bg.inputs['Color'])
W['skybg'] = sky_bg
# hemisphere lighting
hz = wnode('ShaderNodeMapRange', clamp=True)
hz.inputs['From Min'].default_value = -1; hz.inputs['From Max'].default_value = 1
wn.links.new(sep.outputs['Z'], hz.inputs['Value'])
W['hsky'] = wnode('ShaderNodeRGB'); W['hgnd'] = wnode('ShaderNodeRGB')
hm = wnode('ShaderNodeMix', data_type='RGBA')
wn.links.new(hz.outputs[0], hm.inputs['Factor']); wn.links.new(W['hgnd'].outputs[0], hm.inputs['A']); wn.links.new(W['hsky'].outputs[0], hm.inputs['B'])
hbg = wnode('ShaderNodeBackground')
wn.links.new(hm.outputs['Result'], hbg.inputs['Color'])
W['hbg'] = hbg
lp = wnode('ShaderNodeLightPath')
wmix = wnode('ShaderNodeMixShader')
wn.links.new(lp.outputs['Is Camera Ray'], wmix.inputs['Fac'])
wn.links.new(hbg.outputs[0], wmix.inputs[1]); wn.links.new(sky_bg.outputs[0], wmix.inputs[2])
wout = wnode('ShaderNodeOutputWorld')
wn.links.new(wmix.outputs[0], wout.inputs['Surface'])
W['wmix'] = wmix
W['lp'] = lp


def set_sky(s):
    if not s:
        return
    for k2 in ('top', 'mid', 'hor', 'sun'):
        W[k2].outputs[0].default_value = (*s[k2], 1)
    ax, el = s['sunPos']
    d3 = (math.sin(ax) * math.cos(el), math.sin(el), -math.cos(ax) * math.cos(el))
    d = C @ Vector(d3)
    W['sundir'].inputs[0].default_value = d.x; W['sundir'].inputs[1].default_value = d.y; W['sundir'].inputs[2].default_value = d.z
    W['glow'].inputs[1].default_value = s['sunGlow'] * 0.6
    W['skybg'].inputs['Strength'].default_value = 1.0 if s.get('on', True) else 0.0


def apply_hemi():
    W['hsky'].outputs[0].default_value = (*hemi['c'], 1)
    W['hgnd'].outputs[0].default_value = (*hemi['g'], 1)
    W['hbg'].inputs['Strength'].default_value = hemi['i'] / math.pi * 1.2


# ---- camera ------------------------------------------------------------------
cam_data = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_data)
coll.objects.link(cam)
scene.camera = cam
cam_data.sensor_fit = 'VERTICAL'
cam_data.sensor_height = 36
cam_data.clip_start = 0.01
cam_data.clip_end = 200
cam_data.dof.use_dof = True


def set_cam(c, nxt=None):
    cam.matrix_world = C @ m4(c['m'])
    fov = math.radians(c['fov'])
    cam_data.lens = 18 / math.tan(fov / 2)
    cam_data.dof.focus_distance = max(0.05, c['focus'])
    cam_data.dof.aperture_fstop = max(1.6, min(11.0, 0.04 / max(1e-4, c['ap'])))


# ---- render settings ----------------------------------------------------------
scene.render.engine = 'CYCLES'
cy = scene.cycles
cy.device = 'CPU'
cy.samples = A.samples
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.04
cy.use_denoising = True
try:
    cy.denoiser = 'OPENIMAGEDENOISE'
except Exception:
    pass
cy.max_bounces = 6
cy.diffuse_bounces = 2
cy.glossy_bounces = 2
cy.transmission_bounces = 4
cy.transparent_max_bounces = 8
cy.caustics_reflective = False
cy.caustics_refractive = False
cy.blur_glossy = 1.0
cy.sample_clamp_indirect = 6
scene.render.use_persistent_data = True
if os.environ.get('BLENDER_ENGINE') == 'eevee':
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = A.samples
if A.threads:
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = A.threads
scene.render.resolution_x = int(S['width'] * A.scale)
scene.render.resolution_y = int(S['height'] * A.scale)
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.quality = 93
scene.view_settings.view_transform = 'AgX'
LOOK = os.environ.get('BLENDER_LOOK', 'AgX - Punchy')
try:
    scene.view_settings.look = LOOK
except Exception as ex:
    print('look not available', LOOK, ex)
scene.render.fps = S['fps']

# ---- frame loop ---------------------------------------------------------------
frames_dir = os.path.join(SRC, 'frames')
nframes = len([f for f in os.listdir(frames_dir) if f.endswith('.json')])
only = None
if A.only:
    a, b = A.only.split(',')
    only = range(int(a), int(b))
started = time.time()
done = 0
pending_tex = {}


def out_path(f):
    return os.path.join(OUT, f'{f:05d}.jpg')


def load_frame(f):
    return json.load(open(os.path.join(frames_dir, f'{f:05d}.json')))


cur = None
for f in range(nframes):
    st = load_frame(f)
    for name, val in st['o'].items():
        ob = objects.get(name)
        if not ob:
            continue
        if val == 0:
            ob.hide_render = True
        else:
            ob.hide_render = False
            ob.matrix_world = C @ m4(val)
    for mid, val in st['m'].items():
        set_mat_state(mid, val)
    for name, val in st['l'].items():
        set_light(name, val)
    for tid, fn in st['tex'].items():
        pending_tex[tid] = fn
    if 'sky' in st:
        set_sky(st['sky'])
    cur = st
    want = (f % A.step == 0) and (only is None or f in only)
    if not want:
        continue
    if os.path.exists(out_path(f)):
        # copies for the in-between frames may still be missing
        for k2 in range(1, A.step):
            if f + k2 < nframes and not os.path.exists(out_path(f + k2)):
                os.link(out_path(f), out_path(f + k2))
        continue
    for tid, fn in pending_tex.items():
        img = image(os.path.join(TEXDIR, fn), tex_info[tid]['srgb'])
        for n in tex_nodes.get(tid, []):
            n.image = img
    pending_tex = {}
    apply_hemi()
    set_cam(st['cam'])
    scene.view_settings.exposure = math.log2(max(0.05, st.get('exp', 1))) + EXPOSURE
    # whip pans: real motion blur from this frame's camera to the next one's
    whip = st['cam'].get('whip', 0)
    if whip > 0.05 and f + 1 < nframes:
        nxt = load_frame(f + 1)['cam']
        cam.animation_data_clear()
        scene.frame_set(1)
        set_cam(st['cam']); cam.keyframe_insert('location', frame=1); cam.keyframe_insert('rotation_euler', frame=1)
        set_cam(nxt); cam.keyframe_insert('location', frame=1 + A.step); cam.keyframe_insert('rotation_euler', frame=1 + A.step)
        scene.render.use_motion_blur = True
        scene.render.motion_blur_position = 'START'
        scene.render.motion_blur_shutter = 0.9
        scene.frame_set(1)
    else:
        if cam.animation_data:
            cam.animation_data_clear()
        set_cam(st['cam'])
        scene.render.use_motion_blur = False
    tmp = out_path(f)[:-4] + '.tmp.jpg'
    scene.render.filepath = tmp
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    os.replace(tmp, out_path(f))
    for k2 in range(1, A.step):
        if f + k2 < nframes and not os.path.exists(out_path(f + k2)):
            os.link(out_path(f), out_path(f + k2))
    done += 1
    el = time.time() - started
    print(f'BLENDER frame {f + 1}/{nframes}  {time.time() - t0:.1f}s  avg {el / done:.1f}s', flush=True)
print('BLENDER done', flush=True)
