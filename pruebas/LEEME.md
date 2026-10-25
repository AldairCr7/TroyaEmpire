# Banco de pruebas

Mide el equilibrio sin abrir el navegador: juegan dos IA con la misma semilla y
solo cambia lo que estamos midiendo. Desde esta carpeta:

```
node sim.mjs matriz 12    # todas las casas contra todas (12 partidas por cruce)
node sim.mjs zoc 36       # la zona de control: apagada, blanda, actual, dura
node sim.mjs casas 36     # victorias de cada casa
node sim.mjs lados 10     # de dónde sale la ventaja de un bando
node sim.mjs primero 14   # cuánto pesa mover primero
node sim.mjs mapa 40      # reparto de aldeas y yacimientos entre los dos lados
node sim.mjs granjas 40   # capacidad económica real junto a cada campamento
node sim.mjs traza 16     # sigue una partida por dentro, turno a turno
node sanidad.mjs          # genera todos los escenarios y capítulos y comprueba que arrancan
node terreno.mjs          # histograma de terreno alrededor de cada campamento
```

Ojo con el ruido: con 12 partidas por cruce, un total de 36 partidas tiene un
margen de unos ±16 puntos. Una diferencia de 10 puntos entre dos casas no
significa nada; una de 25, sí.
