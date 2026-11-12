"""Build the glove in the same photo coordinates used to trace the laminate."""
import bpy
import bmesh
import numpy as np
from mathutils import Vector

# Each sensing pivot sits beneath the printed center of its PVDF pad.
# Z is depth relative to the middle of the palm, in reference-image pixels.
DIGITS = {
    "Index":  ([(343,500,2),(359,306,5),(370,190,1),(375,126,-4)], [43,39,34,28]),
    "Middle": ([(246,484,4),(258,270,7),(265,151,2),(268,87,-4)], [46,41,35,29]),
    "Ring":   ([(155,494,1),(155,291,4),(156,177,0),(156,116,-6)], [42,38,34,28]),
    "Little": ([(73,516,-3),(73,357,0),(71,253,-3),(69,190,-9)], [38,35,31,26]),
    "Thumb":  ([(331,793,-14),(528,646,-10),(641,501,-13),(666,466,-21)], [76,49,39,32]),
}


def world(points):
    return (np.asarray(points) - [215,654,0]) * [1/110,-1/110,1/110]


def register_rig(rig):
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for finger,(points,_) in DIGITS.items():
        joints = ("CMC","MCP","IP") if finger == "Thumb" else ("MCP","PIP","DIP")
        for name,a,b in zip(joints,world(points),world(points[1:])):
            bone = rig.data.edit_bones[f"{finger}_{name}"]
            bone.head, bone.tail = Vector(a), Vector(b)
            bone.align_roll(Vector((0,0,1)))
    bpy.ops.object.mode_set(mode="OBJECT")


def union(a,b,width):
    return np.minimum(a,b) - np.maximum(width-np.abs(a-b),0)**2 / (4*width)


def surface_nets(field, origin, step):
    corners = np.array([[i,j,k] for i in range(2) for j in range(2) for k in range(2)])
    size = np.array(field.shape)-1
    values = np.stack([field[i:i+size[0],j:j+size[1],k:k+size[2]] for i,j,k in corners],axis=-1)
    cells = np.argwhere((values.min(-1)<0) & (values.max(-1)>=0))
    samples = values[tuple(cells.T)]
    positions = np.zeros((len(cells),3))
    counts = np.zeros(len(cells))
    faces = []
    for axis,stride in enumerate((4,2,1)):
        for i,c in enumerate(corners):
            if c[axis]: continue
            mask = (samples[:,i]<0) != (samples[:,i+stride]<0)
            t = samples[mask,i]/(samples[mask,i]-samples[mask,i+stride])
            positions[mask] += c + t[:,None]*(corners[i+stride]-c)
            counts[mask] += 1
    points = origin + (cells+positions/counts[:,None])*step
    ids = np.full(size,-1,dtype=int)
    ids[tuple(cells.T)] = np.arange(len(cells))
    for axis in range(3):
        crossing = np.argwhere(np.diff(field<0,axis=axis))
        ea,eb = np.eye(3,dtype=int)[[(axis+1)%3,(axis+2)%3]]
        quad = np.stack([ids[tuple(v.T)] for v in (crossing,crossing-ea,crossing-ea-eb,crossing-eb)],axis=1)
        assert np.all(quad>=0), "Glove intersects grid boundary"
        faces.extend(quad.tolist())
    return points,faces


def sculpt(shell):
    origin = np.array([-14,40,-108])
    step = 4
    x,y,z = [origin[i]+v*step for i,v in enumerate(np.ogrid[:187,:228,:55])]
    levels = [465,485,510,550,600,656,720,780,831,879,928]
    left = np.interp(y,levels,[130,91,67,46,32,27,30,48,70,98,111])
    right = np.interp(y,levels,[295,325,350,371,389,400,421,425,397,366,354])
    depth = np.interp(y,levels,[22,28,34,42,47,50,51,50,48,46,43])
    lateral = (2*x-right-left)/(right-left)
    # Rounded heel and relatively flat dorsal support under the populated board.
    section = ((abs(lateral)**3.8+abs(z/depth)**3.8)**(1/3.8)-1)*depth
    top = 483 + 34*((x-218)/178)**2
    field = np.maximum(section,np.maximum(top-y,y-922))

    def pad(cx,cy,cz,rx,ry,rz,tilt=0):
        dx=x-cx; dy=y-cy
        c,s=np.cos(tilt),np.sin(tilt)
        return (np.sqrt(((c*dx+s*dy)/rx)**2+((-s*dx+c*dy)/ry)**2+((z-cz)/rz)**2)-1)*rz

    for args,blend in [
        ((345,751,-18,78,106,50,-.47),26), ((104,731,-20,56,99,39,.17),19),
        ((111,524,0,51,39,22,.12),16), ((200,504,2,56,34,24,-.10),16),
        ((295,505,4,57,38,25,.16),16),
    ]:
        field = union(field,pad(*args),blend)

    # A concave Bezier boundary sweeps from the index metacarpal to the
    # thumb shaft. The membrane thins toward this free edge.
    t=np.linspace(0,1,81)[:,None]
    a,b,c,d=np.array([(350,504),(372,696),(412,731),(540,567)])
    curve=(1-t)**3*a+3*t*(1-t)**2*b+3*t**2*(1-t)*c+t**3*d
    upper=np.interp(x,curve[:,0],curve[:,1])
    lower=np.interp(x,[350,410,472,540],[809,792,747,658])
    half=(lower-upper)/2
    web=(np.sqrt(((y-(upper+lower)/2)/half)**2+((z+9)/29)**2)-1)*29
    field=union(field,np.maximum(web,np.maximum(350-x,x-540)),14)

    for finger,(path,radii) in DIGITS.items():
        for i,(start,end) in enumerate(zip(path,path[1:])):
            a,b = np.array(start),np.array(end)
            d = b-a
            length = np.linalg.norm(d[:2])
            ux,uy = d[:2]/length
            t = (x-a[0])*ux+(y-a[1])*uy
            u = np.clip(t/length,0,1)
            cross = (x-a[0])*uy-(y-a[1])*ux
            # A slight bow and pad fullness break the straight tube silhouette.
            bow = (5 if finger=="Thumb" else 1.8)*np.sin(np.pi*u)
            radius = (radii[i]*(1-u)+radii[i+1]*u)*(1-.043*np.sin(np.pi*u)**2)
            dz = z-(a[2]+u*d[2]+2.5*np.sin(np.pi*u))
            rz = radius*np.where(dz<0,1.02,.82)
            cap = np.maximum(np.maximum(-t,t-length),0)/radius
            sdf = ((abs((cross-bow)/radius)**2.8+abs(dz/rz)**2.8+cap**2.8)**(1/2.8)-1)*radius
            field = union(field,sdf,19 if i==0 else 4)
    pixels,faces = surface_nets(field,origin,step)
    points = world(pixels)
    mat = shell.data.materials[0]
    mesh = bpy.data.meshes.new("Registered glove surface")
    mesh.from_pydata(points.tolist(),[],faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    shell.data = mesh
    mesh.materials.append(mat)
    uv = mesh.uv_layers.new(name="Textile")
    for face in mesh.polygons:
        face.use_smooth = True
        axes = [(1,2),(0,2),(0,1)][np.argmax(np.abs(face.normal))]
        for j in face.loop_indices:
            p = points[mesh.loops[j].vertex_index]
            uv.data[j].uv = (4*p[axes[0]],4*p[axes[1]])
    bind(shell,pixels)


def bind(shell,points):
    # Blend adjacent chains across webbing. The dorsal laminate follows the same weights.
    distances,progress,breaks = [],[],[]
    for path,_ in DIGITS.values():
        path=np.array(path,dtype=float)[:,:2]
        xy=points[:,:2]
        lengths=np.linalg.norm(np.diff(path,axis=0),axis=1)
        along=np.r_[0,np.cumsum(lengths)]
        ds,ts=[],[]
        for i,(a,b) in enumerate(zip(path,path[1:])):
            axis=(b-a)/lengths[i]
            t=(xy-a)@axis
            near=a+np.clip(t,0,lengths[i])[:,None]*axis
            ds.append(np.linalg.norm(xy-near,axis=1))
            ts.append(t+along[i])
        seg=np.argmin(ds,axis=0)
        distances.append(np.min(ds,axis=0))
        progress.append(np.choose(seg,ts))
        breaks.append(along)
    dist=np.array(distances)
    affinity=np.exp(-(dist**2-dist.min(axis=0)**2)/(21**2))
    affinity/=affinity.sum(axis=0)
    groups={"WristRoot":np.ones(len(points))}
    for i,finger in enumerate(DIGITS):
        names=("CMC","MCP","IP") if finger=="Thumb" else ("MCP","PIP","DIP")
        # The thumb metacarpal is embedded in the heel. Fade its influence
        # laterally to keep electronics on the central palm stable in opposition.
        strength=affinity[i]
        if finger=="Thumb":
            heel=np.clip(1-progress[i]/110,0,1)
            strength=strength*(1-heel*np.clip((dist[i]-53)/58,0,1))
        # Share flexion across the full dorsal pad and both adjacent phalanges.
        after=[]
        for j,half_width in enumerate((70,55,43)):
            u=np.clip(.5+(progress[i]-breaks[i][j])/(2*half_width),0,1)
            after.append(strength*u*u*(3-2*u))
        groups["WristRoot"]-=after[0]
        for j,name in enumerate(names):
            groups[f"{finger}_{name}"]=after[j]-(after[j+1] if j<2 else 0)
    weights=np.maximum(np.array(list(groups.values())).T,0)
    # Four influences are preserved by both glTF export and Three.js skinning.
    keep=np.argsort(weights,axis=1)[:,-4:]
    out=np.zeros_like(weights)
    np.put_along_axis(out,keep,np.take_along_axis(weights,keep,axis=1),axis=1)
    out/=out.sum(axis=1,keepdims=True)
    shell.vertex_groups.clear()
    for name,w in zip(groups,out.T):
        group=shell.vertex_groups.new(name=name)
        full=np.flatnonzero(w>=.99999).tolist()
        if full: group.add(full,1,"REPLACE")
        for k in np.flatnonzero((w>1e-6)&(w<.99999)):
            group.add([int(k)],float(w[k]),"REPLACE")
