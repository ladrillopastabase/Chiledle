"""Genera data.js a partir de fuentes públicas.

Fuentes:
  - Límites comunales en alta definición (INE, precenso 2016, ya con la Región de Ñuble):
    https://github.com/robsalasco/precenso_2016_geojson_chile (Comunas/R01..R16.geojson),
    simplificados con mapshaper respetando las fronteras compartidas (ver tools/build.sh).
  - Nombres con tildes y provincias: https://github.com/fcortes/Chile-GeoJSON (comunas.geojson)
  - Población Censo 2017: paquete R chilemapas (data/censo_2017_comunas.rda)

Uso:
  pip install shapely rdata
  sh tools/build.sh <carpeta_de_trabajo>
"""
import json
import math
import sys
import warnings

import rdata
from shapely.geometry import shape, MultiPolygon, Polygon

warnings.filterwarnings("ignore")

SRC = sys.argv[1]
OUT = sys.argv[2]

# Las coordenadas de los trazados se guardan como enteros (1 unidad = 1/K grado proyectado).
K = 10000

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
LON0 = -71.0


def proj(lon, lat):
    """Proyección sinusoidal centrada en el meridiano 71°O (unidades ~grados)."""
    return ((lon - LON0) * math.cos(math.radians(lat)), -lat)


def polys_of(g):
    return list(g.geoms) if isinstance(g, MultiPolygon) else [g]


def proj_geom(g):
    out = []
    for p in polys_of(g):
        ext = [proj(x, y) for x, y in p.exterior.coords]
        holes = [[proj(x, y) for x, y in r.coords] for r in p.interiors]
        out.append(Polygon(ext, holes))
    return MultiPolygon(out)


def to_path(g):
    """Trazado SVG compacto: enteros relativos (escala K), p. ej. "M123 456l3-2 5 1z"."""
    parts = []
    for p in g.geoms:
        for ring in [p.exterior, *p.interiors]:
            pts = []
            for x, y in list(ring.coords)[:-1]:
                q = (round(x * K), round(y * K))
                if not pts or q != pts[-1]:
                    pts.append(q)
            if len(pts) < 3:
                continue
            out = [f"M{pts[0][0]} {pts[0][1]}l"]
            prev = pts[0]
            nums = []
            for q in pts[1:]:
                nums += [q[0] - prev[0], q[1] - prev[1]]
                prev = q
            buf = ""
            for n in nums:
                buf += (str(n) if n < 0 or not buf else f" {n}")
            out.append(buf + "z")
            parts.append("".join(out))
    return "".join(parts)


def bbox(g):
    x0, y0, x1, y1 = g.bounds
    return [round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)]


def label_point(g):
    main_poly = max(polys_of(g), key=lambda q: q.area)
    c = main_poly.centroid
    return c if main_poly.contains(c) else main_poly.representative_point()


def main():
    hd = json.load(open(f"{SRC}/comunas_hd.json", encoding="utf-8"))
    hd_reg = json.load(open(f"{SRC}/regiones_hd.json", encoding="utf-8"))
    old = json.load(open(f"{SRC}/comunas.geojson", encoding="utf-8"))
    censo = rdata.read_rda(f"{SRC}/censo_2017_comunas.rda")["censo_2017_comunas"]
    pop = censo.groupby("codigo_comuna").poblacion.sum()
    pop = {int(k): int(v) for k, v in pop.items()}
    info = {f["properties"]["cod_comuna"]: f["properties"] for f in old["features"]}

    comunas = []
    for f in hd["features"]:
        code = int(f["properties"]["COMUNA"])
        g = shape(f["geometry"])
        p = info[code]
        nombre = p["Comuna"].strip()
        nombre = NOMBRES.get(nombre, nombre)
        lp = label_point(g)
        pg = proj_geom(g)
        comunas.append({
            "c": code,
            "n": nombre,
            "r": int(f["properties"]["REGION"]),
            "pv": p["Provincia"],
            "pop": pop[code],
            "cab": CABECERAS.get(nombre, nombre),
            "lat": round(lp.y, 4),
            "lon": round(lp.x, 4),
            "isla": ISLAS.get(code),
            "bb": bbox(pg),
            "d": to_path(pg),
        })

    # Antártica Chilena: sin polígono en la fuente.
    comunas.append({
        "c": 12202, "n": "Antártica", "r": 12, "pv": "Antártica Chilena",
        "pop": pop[12202], "cab": CABECERAS["Antártica"], "lat": -62.19, "lon": -58.98,
        "isla": "antartica", "bb": None, "d": "",
    })
    assert len(comunas) == 346, len(comunas)

    geo_reg = {int(f["properties"]["REGION"]): shape(f["geometry"]) for f in hd_reg["features"]}
    regiones = []
    for orden, (code, (nombre, romano, capital)) in enumerate(REGIONES.items()):
        u = geo_reg[code]
        c = label_point(u)
        pg = proj_geom(u)
        # Las regiones no tienen huecos reales.
        pg = MultiPolygon([Polygon(q.exterior) for q in pg.geoms])
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
    missing = caps - {x["n"] for x in comunas}
    assert not missing, missing

    data = {"k": K, "regiones": regiones, "comunas": comunas}
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("// Generado por tools/build_data.py — no editar a mano.\n")
        fh.write("window.CHILE_DATA = ")
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    print(len(comunas), "comunas,", len(regiones), "regiones,", sum(x["pop"] for x in comunas), "habitantes")


if __name__ == "__main__":
    main()
