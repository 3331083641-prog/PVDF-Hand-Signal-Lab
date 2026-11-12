"""Build the glove in the same photo coordinates used to trace the laminate."""
import bpy
import bmesh
import numpy as np
from mathutils import Vector

# Each sensing pivot sits beneath the printed center of its PVDF pad.
# Z is depth relative to the middle of the palm, in reference-image pixels.
DIGITS = {
    "Index":  ([(343,500,2),(359,306,5),(370,190,1),(375,126,-4)], [40,36,32,26]),
    "Middle": ([(246,484,4),(258,270,7),(265,151,2),(268,87,-4)], [42,38,33,27]),
    "Ring":   ([(155,494,1),(155,291,4),(156,177,0),(156,116,-6)], [38,34,30,25]),
    "Little": ([(73,516,-3),(73,357,0),(71,253,-3),(69,190,-9)], [32,29,26,24]),
    "Thumb":  ([(354,782,-20),(528,646,-10),(641,501,-13),(666,466,-21)], [76,49,39,32]),
}


def world(points):
    return (np.asarray(points) - [215,654,0]) * [1/110,-1/110,1/110]


def register_rig(rig, pad_bones):
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for finger,(points,_) in DIGITS.items():
        joints = ("CMC","MCP","IP") if finger == "Thumb" else ("MCP","PIP","DIP")
        for name,a,b in zip(joints,world(points),world(points[1:])):
            bone = rig.data.edit_bones[f"{finger}_{name}"]
            bone.head, bone.tail = Vector(a), Vector(b)
            bone.align_roll(Vector((0,0,1)))
    for name in pad_bones.values():
        joint=rig.data.edit_bones[name]
        mount=rig.data.edit_bones.new("Mount_"+name)
        mount.parent=joint.parent
        mount.head,mount.tail=joint.head.copy(),joint.tail.copy()
        mount.roll=joint.roll
    bpy.ops.object.mode_set(mode="OBJECT")
    for name in pad_bones.values():
        mount=rig.pose.bones["Mount_"+name]
        follow=mount.constraints.new("COPY_TRANSFORMS")
        follow.target=rig
        follow.subtarget=name
        follow.target_space=follow.owner_space="LOCAL"
        follow.influence=.5



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


def sculpt(shell, pads):
    origin = np.array([-14,40,-108])
    step = 4
    x,y,z = [origin[i]+v*step for i,v in enumerate(np.ogrid[:187,:228,:55])]
    levels = [465,485,510,550,600,656,720,780,831,879,928]
    left = np.interp(y,levels,[130,91,67,46,32,27,30,48,70,98,111])
    right = np.interp(y,levels,[295,325,350,371,389,400,421,425,397,366,354])
    depth = np.interp(y,levels,[22,28,34,42,47,50,51,50,48,46,43])
    lateral = (2*x-right-left)/(right-left)
    # Rounded heel and relatively flat dorsal support under the populated board.
    # Transverse arch: the palm is hollow between the thenar and
    # hypothenar eminences; the dorsal side rounds over the metacarpals.
    hollow=14*np.exp(-((x-206)/88)**2-((y-680)/122)**2)
    upper=depth+5*np.exp(-((x-230)/103)**2-((y-563)/86)**2)
    lower=depth-hollow
    # Follow the main palmar flexion folds only on the volar surface.
    # Textile rounds these landmarks so they read as shallow depressions.
    for level,slope,amplitude in [(563,.19,5.0),(621,-.16,4.5)]:
        fold=y-level-slope*(x-213)-.0009*(x-213)**2
        lower-=amplitude*np.exp(-(fold/9)**2-((x-215)/135)**4)
    central_z=(upper-lower)/2
    top=520+39*((x-220)/176)**2
    endcap=np.maximum(top-y,0)/55
    section=((abs(lateral)**2.65+abs((z-central_z)/((upper+lower)/2))**2.65+endcap**2)**(1/2.65)-1)*depth
    field=np.maximum(section,y-922)

    def pad(cx,cy,cz,rx,ry,rz,tilt=0):
        dx=x-cx; dy=y-cy
        c,s=np.cos(tilt),np.sin(tilt)
        return (np.sqrt(((c*dx+s*dy)/rx)**2+((-s*dx+c*dy)/ry)**2+((z-cz)/rz)**2)-1)*rz

    for args,blend in [
        ((335,741,-27,73,121,43,-.51),36), ((104,716,-22,52,118,36,.20),30),
        ((416,743,-14,96,51,38,-.61),25),
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
    # Round off the membrane ends inside the palm and thumb shaft.
    end=np.maximum(np.maximum(346-x,x-528),0)/30
    web=(np.sqrt(((y-(upper+lower)/2)/half)**2+((z+9)/29)**2+end**2)-1)*29
    field=union(field,web,19)

    for finger,(path,radii) in DIGITS.items():
        if finger!="Thumb":
            cx,cy,cz=path[0]
            # Carry each metacarpal into its knuckle. These sloping roots
            # close the space beneath the board without filling the free digits.
            field=union(field,pad(cx,cy+59,cz,radii[0]*1.07,95,32),18)
            field=union(field,pad(cx,cy+48,-17,radii[0]*.95,61,26),14)
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
            shaft=np.sin(np.pi*u)**2
            radius=(radii[i]*(1-u)+radii[i+1]*u)*(1-.09*shaft)
            dz=z-(a[2]+u*d[2]+3.5*np.sin(np.pi*u))
            # Paired interphalangeal creases on the palm; phalangeal pads
            # and rounded knuckles give each segment a distinct side profile.
            crease=2.5*np.exp(-((t-5-.12*cross)/5)**2)+1.4*np.exp(-((t+7-.10*cross)/4)**2)
            knuckle=3.8*np.exp(-(t/20)**2)
            volar=radius*.85+5*shaft-crease
            dorsal=radius*.75+knuckle
            rz=np.where(dz<0,volar,dorsal)
            cap=np.maximum(np.maximum(-t,t-length),0)/radius
            sdf=((abs((cross-bow)/radius)**2.25+abs(dz/rz)**2.25+cap**2.25)**(1/2.25)-1)*radius
            # Blend into the palm only near the MCP. Applying the large
            # union radius along the whole shaft bridges neighbouring fingers.
            width=3+16*np.exp(-(t/33)**2) if i==0 else 3
            field=union(field,sdf,width)
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
    bind(shell,pixels,pads)


def bind(shell,points,pads):
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
    web_width=21+36*np.exp(-((points[:,0]-379)/81)**4-((points[:,1]-659)/110)**4)
    web_width+=28*np.exp(-((points[:,1]-467)/49)**2)
    affinity=np.exp(-(dist**2-dist.min(axis=0)**2)/web_width**2)
    affinity/=affinity.sum(axis=0)
    # Beyond the web, every shaft belongs exclusively to its own chain.
    free=np.clip((443-points[:,1])/40,0,1)*np.clip((420-points[:,0])/24,0,1)
    free=free*free*(3-2*free)
    own=np.eye(len(DIGITS))[dist.argmin(axis=0)].T
    affinity=affinity*(1-free)+own*free
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
    # Each joint has a dorsal mounting area that shares the half-angle
    # frame of the rigid sensor. Fade back to ordinary skinning at its rim.
    from mathutils.geometry import convex_hull_2d
    masks=[]
    for bone,pad in pads.items():
        xy=np.array(pad["points"])
        hull=xy[convex_hull_2d([Vector(v) for v in xy])]
        edges=np.roll(hull,-1,axis=0)-hull
        orient=np.sign(np.sum(hull[:,0]*edges[:,1]-hull[:,1]*edges[:,0]))
        outside=np.full(len(points),-np.inf)
        for start,edge in zip(hull,edges):
            if np.linalg.norm(edge)<1e-6: continue
            dx,dy=(points[:,:2]-start).T
            outside=np.maximum(outside,orient*(dx*edge[1]-dy*edge[0])/np.linalg.norm(edge))
        u=np.clip((outside-5)/23,0,1)
        strength=1-u*u*(3-2*u)
        reference_z=next(p[2] for finger,(path,_) in DIGITS.items()
                         for p,j in zip(path,("CMC","MCP","IP") if finger=="Thumb" else ("MCP","PIP","DIP"))
                         if finger+"_"+j==bone)
        dorsal=np.clip((points[:,2]-reference_z+12)/18,0,1)
        masks.append(strength*dorsal*dorsal*(3-2*dorsal))
    masks=np.array(masks)
    # Preserve a single rigid influence under each pad, including close neighbours.
    peak=masks.max(axis=0)
    masks=masks**6
    masks*=peak/np.maximum(masks.sum(axis=0),1e-30)
    for key in groups: groups[key]*=1-peak
    for name,mask in zip(pads,masks): groups["Mount_"+name]=mask
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
