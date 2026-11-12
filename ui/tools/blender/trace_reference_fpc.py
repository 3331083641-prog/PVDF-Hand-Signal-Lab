"""Trace the front-view reference. Run with Python plus OpenCV and Shapely 2.1.
Pass the intermediate JSON path as the sole argument, then pass it to the Blender builder.
All measurements here are in pixels of the 712 x 922 reference.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from shapely import Polygon, box, constrained_delaunay_triangles, make_valid

root = Path(__file__).resolve().parents[2]
image = cv2.imdecode(np.fromfile(root / "assets/reference/hsad_fpc_front.png", np.uint8), -1)
assert image.shape == (922,712,4)
mask = (image[:,:,3] >= 128).astype("uint8")
contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
outline = make_valid(Polygon(max(contours, key=cv2.contourArea)[:,0,:])).simplify(.65)
remaining = outline
patches = []


def polygons(shape):
    if shape.geom_type == "Polygon":
        yield shape
    else:
        for part in getattr(shape, "geoms", []):
            yield from polygons(part)


def patch(name, kind, shape, height=0, owner=None):
    global remaining
    surface = remaining.intersection(shape)
    if surface.is_empty or surface.area < 1:
        return
    remaining = remaining.difference(shape)
    points, faces, lookup = [], [], {}
    def vertex(p):
        key = tuple(round(v,4) for v in p)
        if key not in lookup:
            lookup[key] = len(points)
            points.append(key)
        return lookup[key]

    # Intersect with a common lattice so that bending and UVs follow the surface.
    for part in polygons(surface):
        x0,y0,x1,y1 = part.bounds
        for x in range(int(x0//10)*10,int(x1)+1,10):
            for y in range(int(y0//10)*10,int(y1)+1,10):
                for cell in polygons(part.intersection(box(x,y,x+10,y+10))):
                    for tri in constrained_delaunay_triangles(cell).geoms:
                        faces.append([vertex(p) for p in list(tri.exterior.coords)[:3]])
    if faces:
        patches.append(dict(name=name,kind=kind,height=height,owner=owner,points=points,faces=faces))


# IC bodies and surrounding terminals retain distinct relief and photo coordinates.
def package(name, corners, height, kind):
    patch(name,kind,Polygon(corners),height)


for i,(x,y) in enumerate([(114,641),(168,644),(221,646),(276,649),(126,698),(182,701),(236,704)]):
    package("Amplifier_%02d"%(i+1),[(x-9,y-11),(x+9,y-10),(x+9,y+11),(x-9,y+10)],.048,"conditioning")
    # Isolate the solder terminals along both edges of each package.
    for side in [-1,1]:
        for pin in range(6):
            px,py=x+side*11,y-9+pin*3.5
            patch(f"Lead_{i}_{side}_{pin}","conditioning",box(px-1.9,py-.9,px+1.9,py+.9),.018)

package("ESP32_Shield",[(154,751),(217,756),(214,832),(151,826)],.093,"esp32")
package("ESP32Module",[(147,745),(229,749),(224,863),(145,859)],.036,"esp32")
for i,(x,y,w,h) in enumerate([(100,745,10,18),(130,747,11,16),(122,774,17,21),(262,783,10,19),
        (261,810,10,18),(249,845,23,15),(285,846,12,23),(297,776,17,9),(295,814,18,10)]):
    kind = "mux" if i in (0,1,3,4) else "serial" if i==2 else "power"
    patch(f"{kind.title()}Package_{i:02d}",kind,box(x-w/2,y-h/2,x+w/2,y+h/2),.040)

# Use the low-saturation component bodies in the populated regions of the
# photograph to pick up the small passives and solder islands around the ICs.
hsv=cv2.cvtColor(image[:,:,:3],cv2.COLOR_BGR2HSV)
populated=np.zeros(mask.shape,np.uint8)
for x,y in [(114,641),(168,644),(221,646),(276,649),(126,698),(182,701),(236,704)]:
    cv2.rectangle(populated,(x-22,y-22),(x+22,y+23),1,-1)
cv2.fillPoly(populated,[np.int32([(88,731),(141,736),(142,849),(118,846),(85,779)])],1)
cv2.fillPoly(populated,[np.int32([(235,765),(319,767),(325,869),(234,866)])],1)
found,_=cv2.findContours(((hsv[:,:,1]<87)*populated).astype("uint8"),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
passives={"conditioning":[],"acquisition":[]}
for contour in found:
    x,y,w,h=cv2.boundingRect(contour)
    if 3<=w<=14 and 2<=h<=10 and 5<=cv2.contourArea(contour)<=75:
        hull=cv2.convexHull(contour)[:,0,:]
        if len(hull)>=3:
            passives["conditioning" if y<732 else "acquisition"].append(Polygon(hull))
from shapely.ops import unary_union
for kind,items in passives.items():
    patch("SMD_"+kind,kind,unary_union(items),.017)
# Cut each pad at its actual neck. The rest of each branch is the die-cut meander.
fingers = {
    "L":([(73,516),(73,357),(71,253)],[(55,58),(48,49),(60,35)],(0,-1),box(40,65,110,597)),
    "R":([(155,494),(155,291),(156,177)],[(54,53),(46,50),(59,41)],(0,-1),box(113,65,202,572)),
    "M":([(246,484),(258,270),(265,151)],[(61,50),(50,47),(62,43)],(.053,-.999),box(202,65,306,576)),
    "I":([(343,500),(359,306),(370,190)],[(62,52),(50,52),(63,42)],(.093,-.996),box(305,65,411,574)),
    "T":([(528,646),(641,501)],[(60,59),(64,57)],(.61,-.792),Polygon([(414,751),(480,646),(620,431),(707,439),(703,551),(458,795)])),
}
for finger,(centers,limits,direction,branch) in fingers.items():
    axis=np.array(direction)
    lateral=np.array([-axis[1],axis[0]])
    for n,((cx,cy),(distal,proximal)) in enumerate(zip(centers,limits),1):
        center=np.array([cx,cy])
        clip=Polygon([center+axis*t+lateral*w for t,w in
            [(-proximal,-29),(distal,-29),(distal,29),(-proximal,29)]])
        patch(f"Sensor_{finger}{n}","sensor",clip)
    patch("Serpentine_"+finger,"serpentine",branch)
# The electronics occupy the inner amber region; keep its acquisition hotspot.
patch("CircuitModule","acquisition",Polygon([(92,610),(314,622),(325,650),(328,856),
    (315,872),(122,858),(124,819),(94,789),(84,755)]))
patch("MainFPC","fpc",outline)
# Recover the external boundary only. Interior semantic seams have no physical wall.
from shapely.geometry import Point
for info in patches:
    pts=np.array(info["points"])
    outer=outline.boundary
    edges={}
    for tri in info["faces"]:
        for a,b in zip(tri,tri[1:]+tri[:1]):
            pair=tuple(sorted((a,b)))
            edges[pair]=edges.get(pair,0)+1
    info["sides"]=[pair for pair,count in edges.items() if count==1 and
        (info["height"] or outer.distance(Point(pts[list(pair)].mean(axis=0)))<.02)]
# Batch the individual pins by package so browser draw calls scale with ICs.
batched={}
for part in patches:
    if not part["name"].startswith("Lead_"):
        batched[part["name"]]=part
        continue
    key="_".join(part["name"].split("_")[:2])+"_Terminals"
    dest=batched.setdefault(key,{**part,"name":key,"points":[],"faces":[],"sides":[]})
    offset=len(dest["points"])
    dest["points"].extend(part["points"])
    for field in ("faces","sides"):
        dest[field].extend([[v+offset for v in row] for row in part[field]])
Path(sys.argv[1]).write_text(json.dumps(list(batched.values()),separators=(",",":")),encoding="utf8")
print("Patches:",len(patches),"outline area in square pixels:",round(outline.area))
