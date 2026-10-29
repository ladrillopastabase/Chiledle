"""Genera data.js a partir de fuentes públicas.

Fuentes:
  - Polígonos de comunas: https://github.com/fcortes/Chile-GeoJSON (comunas.geojson)
  - Población Censo 2017 y códigos: paquete R chilemapas
    (data/censo_2017_comunas.rda, data/codigos_territoriales.rda)

Uso:
  pip install shapely rdata
  python tools/build_data.py <carpeta_con_fuentes> data.js
"""
import json
import math
import sys
import warnings

import rdata
from shapely.geometry import shape, MultiPolygon, Polygon
from shapely.ops import unary_union

warnings.filterwarnings("ignore")

SRC = sys.argv[1]
OUT = sys.argv[2]

REGIONES = {
    15: ("Arica y Parinacota", "XV", "Arica"),
    1: ("Tarapacá", "I", "Iquique"),
    2: ("Antofagasta", "II", "Antofagasta"),
    3: ("Atacama", "III", "Copiapó"),
    4: ("Coquimbo", "IV", "La Serena"),
    5: ("Valparaíso", "V", "Valparaíso"),
    13: ("Metropolitana de Santiago", "RM", "Santiago"),
    6: ("Libertador General Bernardo O'Higgins", "VI", "Rancagua"),
    7: ("Maule", "VII", "Talca"),
    16: ("Ñuble", "XVI", "Chillán"),
    8: ("Biobío", "VIII", "Concepción"),
    9: ("La Araucanía", "IX", "Temuco"),
    14: ("Los Ríos", "XIV", "Valdivia"),
    10: ("Los Lagos", "X", "Puerto Montt"),
    11: ("Aysén del General Carlos Ibáñez del Campo", "XI", "Coyhaique"),
    12: ("Magallanes y de la Antártica Chilena", "XII", "Punta Arenas"),
}

# Localidad cabecera (ciudad principal) cuando no coincide con el nombre de la comuna.
CABECERAS = {
    "Camarones": "Cuya",
    "General Lagos": "Visviri",
    "Río Hurtado": "Samo Alto",
    "Canela": "Canela Baja",
    "Isla de Pascua": "Hanga Roa",
    "Juan Fernández": "San Juan Bautista",
    "Alhué": "Villa Alhué",
    "Mostazal": "San Francisco de Mostazal",
    "San Vicente": "San Vicente de Tagua Tagua",
    "Pelluhue": "Curanipe",
    "Río Claro": "Cumpeo",
    "Ránquil": "Ñipas",
    "Ñiquén": "San Gregorio",
    "San Fabián": "San Fabián de Alico",
    "Alto Biobío": "Ralco",
    "Tucapel": "Huépil",
    "Saavedra": "Puerto Saavedra",
    "Teodoro Schmidt": "Hualpín",
    "Toltén": "Nueva Toltén",
    "Mariquina": "San José de la Mariquina",
    "Quinchao": "Achao",
    "Puyehue": "Entre Lagos",
    "San Juan de la Costa": "Puaucho",
    "Hualaihué": "Hornopirén",
    "Aysén": "Puerto Aysén",
    "Cisnes": "Puerto Cisnes",
    "Guaitecas": "Melinka",
    "O'Higgins": "Villa O'Higgins",
    "Tortel": "Caleta Tortel",
    "Río Ibáñez": "Puerto Ingeniero Ibáñez",
    "Laguna Blanca": "Villa Tehuelches",
    "San Gregorio": "Punta Delgada",
    "Cabo de Hornos": "Puerto Williams",
    "Antártica": "Villa Las Estrellas",
    "Primavera": "Cerro Sombrero",
    "Timaukel": "Pampa Guanaco",
    "Natales": "Puerto Natales",
    "Torres del Paine": "Cerro Castillo",
}

# Correcciones de nombre respecto de la fuente.
NOMBRES = {
    "Los Alamos": "Los Álamos",
    "Los Angeles": "Los Ángeles",
    "Ranquil": "Ránquil",
    "Calera": "La Calera",
}

ISLAS = {5201: "pascua", 5104: "juanfernandez"}
LAT0 = -71.0


def proj(lon, lat):
    """Proyección sinusoidal centrada en el meridiano 71°O (unidades ~grados)."""
    return ((lon - LAT0) * math.cos(math.radians(lat)), -lat)


def proj_geom(g):
    polys = list(g.geoms) if isinstance(g, MultiPolygon) else [g]
    out = []
    for p in polys:
        ext = [proj(x, y) for x, y in p.exterior.coords]
        holes = [[proj(x, y) for x, y in r.coords] for r in p.interiors]
        out.append(Polygon(ext, holes))
    return MultiPolygon(out)


def clean(g, tol, min_area):
    g = g.buffer(0).simplify(tol, preserve_topology=True)
    polys = list(g.geoms) if hasattr(g, "geoms") else [g]
    polys = [p for p in polys if isinstance(p, Polygon) and not p.is_empty]
    biggest = max(polys, key=lambda p: p.area)
    keep = [p for p in polys if p.area >= min_area or p is biggest]
    return MultiPolygon(keep)


def to_path(g):
    parts = []
    for p in g.geoms:
        for ring in [p.exterior, *p.interiors]:
            pts = list(ring.coords)[:-1]
            if len(pts) < 3:
                continue
            s = "M" + "L".join(f"{x:.3f},{y:.3f}".replace("-0.000", "0.000") for x, y in pts) + "Z"
            parts.append(s)
    return "".join(parts)


def bbox(g):
    x0, y0, x1, y1 = g.bounds
    return [round(x0, 3), round(y0, 3), round(x1, 3), round(y1, 3)]


def main():
    geo = json.load(open(f"{SRC}/comunas.geojson", encoding="utf-8"))
    censo = rdata.read_rda(f"{SRC}/censo_2017_comunas.rda")["censo_2017_comunas"]
    pop = censo.groupby("codigo_comuna").poblacion.sum()
    pop = {int(k): int(v) for k, v in pop.items()}

    comunas = []
    raw_by_region = {}
    sin_demarcar = None
    for f in geo["features"]:
        p = f["properties"]
        code = p["cod_comuna"]
        g = shape(f["geometry"])
        if code == 0:
            sin_demarcar = clean(proj_geom(g), 0.004, 0.0005)
            continue
        reg = p["codregion"]
        nombre = p["Comuna"].strip()
        nombre = NOMBRES.get(nombre, nombre)
        # Centroide geográfico (lat/lon) de la parte principal.
        main_poly = max(g.geoms, key=lambda q: q.area) if isinstance(g, MultiPolygon) else g
        rp = main_poly.representative_point() if not main_poly.contains(main_poly.centroid) else main_poly.centroid
        pg = clean(proj_geom(g), 0.0004, 0.000005)
        comunas.append({
            "c": code,
            "n": nombre,
            "r": reg,
            "pv": p["Provincia"],
            "pop": pop[code],
            "cab": CABECERAS.get(nombre, nombre),
            "lat": round(rp.y, 4),
            "lon": round(rp.x, 4),
            "isla": ISLAS.get(code),
            "bb": bbox(pg),
            "d": to_path(pg),
        })
        if code not in ISLAS:
            raw_by_region.setdefault(reg, []).append(g.buffer(0))

    # Antártica Chilena: sin polígono en la fuente.
    comunas.append({
        "c": 12202, "n": "Antártica", "r": 12, "pv": "Antártica Chilena",
        "pop": pop[12202], "cab": CABECERAS["Antártica"], "lat": -62.19, "lon": -58.98,
        "isla": "antartica", "bb": None, "d": "",
    })

    regiones = []
    for orden, (code, (nombre, romano, capital)) in enumerate(REGIONES.items()):
        # Un pequeño buffer cierra las grietas entre comunas vecinas.
        u = unary_union([g.buffer(0.003) for g in raw_by_region[code]]).buffer(-0.003)
        main_poly = max(u.geoms, key=lambda q: q.area) if hasattr(u, "geoms") else u
        c = main_poly.centroid
        if not main_poly.contains(c):
            c = main_poly.representative_point()
        pg = clean(proj_geom(u), 0.004, 0.0004)
        # Las regiones no tienen huecos reales: se eliminan las grietas internas.
        pg = MultiPolygon([Polygon(p.exterior) for p in pg.geoms])
        regiones.append({
            "c": code,
            "n": nombre,
            "rom": romano,
            "cap": capital,
            "o": orden,
            "lat": round(c.y, 4),
            "lon": round(c.x, 4),
            "pop": sum(x["pop"] for x in comunas if x["r"] == code),
            "bb": bbox(pg),
            "d": to_path(pg),
        })

    caps = {r["cap"] for r in regiones}
    found = {x["n"] for x in comunas if x["n"] in caps}
    missing = caps - found
    assert not missing, missing

    data = {
        "regiones": regiones,
        "comunas": comunas,
        "sinDemarcar": {"d": to_path(sin_demarcar), "bb": bbox(sin_demarcar)},
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("// Generado por tools/build_data.py — no editar a mano.\n")
        fh.write("window.CHILE_DATA = ")
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    print(len(comunas), "comunas,", len(regiones), "regiones,", sum(x["pop"] for x in comunas), "habitantes")


if __name__ == "__main__":
    main()
