# Chiledle 🇨🇱

Juego diario de geografía chilena inspirado en [Worldle](https://worldle.teuteuf.fr/).

## Modos

- **Región**: adivina la región del día por su silueta en 6 intentos. Cada intento muestra distancia, dirección y cercanía. Bonus: capital regional, comuna más poblada y número de comunas.
- **Comuna**: adivina la comuna del día. Bonus: región, ciudad principal (cabecera comunal) y habitantes.
- **Ordenar**: ordena 6 ciudades de mayor a menor población en 3 intentos.
- **∞ Comunas**: nombra las 346 comunas de Chile y mira cómo se iluminan en el mapa. Puedes filtrar por región, rendirte para ver las que faltan y retomar tu progreso más tarde.

Tiene modo claro y oscuro (botón 🌙/☀️). El desafío cambia cada día a medianoche (hora de Chile). Todos los jugadores ven el mismo. Después de terminar puedes jugar rondas de práctica.

## Cómo jugar en local

Es un sitio estático, sin dependencias: abre `index.html` en el navegador o sírvelo con cualquier servidor:

```bash
python3 -m http.server 8000
```

Para publicarlo basta con activar GitHub Pages sobre la rama.

## Datos

- Límites comunales en alta definición: INE (precenso 2016) vía [robsalasco/precenso_2016_geojson_chile](https://github.com/robsalasco/precenso_2016_geojson_chile), simplificados con [mapshaper](https://github.com/mbloch/mapshaper) sin romper las fronteras compartidas.
- Nombres con tildes y provincias: [fcortes/Chile-GeoJSON](https://github.com/fcortes/Chile-GeoJSON).
- Población: Censo 2017 (INE), vía el paquete [chilemapas](https://github.com/pachadotdev/chilemapas).

`data.js` se regenera con `sh tools/build.sh <carpeta_de_trabajo>`, que descarga las fuentes, las simplifica con mapshaper (vía `npx`) y llama a `tools/build_data.py` (requiere `pip install shapely rdata`).
