#!/bin/sh
# Descarga las fuentes, simplifica con mapshaper y genera data.js.
# Uso: sh tools/build.sh <carpeta_de_trabajo>
set -e
W="${1:?carpeta de trabajo}"
mkdir -p "$W"
RAW=https://raw.githubusercontent.com
for r in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16; do
  [ -f "$W/R$r.geojson" ] || curl -sSf -o "$W/R$r.geojson" "$RAW/robsalasco/precenso_2016_geojson_chile/master/Comunas/R$r.geojson"
done
[ -f "$W/comunas.geojson" ] || curl -sSf -o "$W/comunas.geojson" "$RAW/fcortes/Chile-GeoJSON/master/comunas.geojson"
[ -f "$W/censo_2017_comunas.rda" ] || curl -sSf -o "$W/censo_2017_comunas.rda" "$RAW/pachadotdev/chilemapas/master/data/censo_2017_comunas.rda"

MS="npx --yes mapshaper@0.6.102 -i"
# Une los archivos regionales, disuelve por comuna y simplifica respetando fronteras compartidas.
$MS "$W"/R*.geojson combine-files -merge-layers force \
  -dissolve2 COMUNA copy-fields=REGION \
  -filter-islands min-area=1km2 remove-empty \
  -simplify interval=120 keep-shapes \
  -o "$W/comunas_hd.json" format=geojson precision=0.00001
# Regiones (sin Isla de Pascua ni Juan Fernández), con menos detalle.
$MS "$W/comunas_hd.json" -filter 'COMUNA != "5201" && COMUNA != "5104"' \
  -dissolve2 REGION -filter-islands min-area=4km2 remove-empty \
  -simplify interval=400 keep-shapes \
  -o "$W/regiones_hd.json" format=geojson precision=0.00001

python3 "$(dirname "$0")/build_data.py" "$W" data.js
