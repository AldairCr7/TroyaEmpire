# Procedencia de los sonidos

Todos los archivos de `audio/muestras/` son **CC0 (dominio público)**. CC0
significa que el autor renunció a todos sus derechos: se pueden usar para lo
que sea, incluso comercialmente, **sin pedir permiso y sin obligación de citar
a nadie**. Esta página existe de todos modos, por dos razones: dejar constancia
de dónde salió cada cosa, y porque citar cuando no hace falta es de bien
nacidos.

Comprobado el **23 de octubre de 2026**, leyendo la licencia en la página de
cada paquete, no en terceros.

## Paquetes

| Paquete | Autor | Licencia | De dónde |
|---|---|---|---|
| RPG Audio | Kenney Vleugels (kenney.nl) | CC0 1.0 | https://kenney.nl/assets/rpg-audio |
| Impact Sounds | Kenney Vleugels (kenney.nl) | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| Interface Sounds | Kenney Vleugels (kenney.nl) | CC0 1.0 | https://kenney.nl/assets/interface-sounds |
| Swishes Sound Pack | artisticdude | CC0 1.0 | https://opengameart.org/content/swishes-sound-pack |
| 40 CC0 water / splash / slime SFX | rubberduck | CC0 1.0 | https://opengameart.org/content/40-cc0-water-splash-slime-sfx |

El paquete de Kenney incluye su propio `License.txt`, que dice literalmente:
*"License (Creative Commons Zero, CC0) — You may use these assets in personal
and commercial projects. Credit (Kenney or www.kenney.nl) would be nice but is
not mandatory."*

## Qué archivo suena para qué

| En el juego | Archivos | Paquete de origen |
|---|---|---|
| espada | `espada-1..3` | RPG Audio (`knifeSlice`) + Impact Sounds (`impactMetal_light`) |
| lanza | `lanza-1..2` | Impact Sounds (`impactWood_medium`) |
| flecha | `flecha-1..3` | Swishes (`swish-1..3`) |
| honda | `honda-1..3` | Swishes (`swish-9..11`) |
| catapulta | `catapulta-1..2` | Impact Sounds (`impactWood_heavy`) + RPG Audio (`creak1`) |
| impacto | `impacto-1..4` | Impact Sounds (`impactPunch_medium`) |
| muerte | `muerte-1..3` | Impact Sounds (`impactSoft_heavy`) |
| derrumbe | `derrumbe-1..3` | Impact Sounds (`impactPlate_heavy`) |
| paso | `paso-1..6` | RPG Audio (`footstep00..05`) |
| remo | `remo-1..3` | water/splash (`splash_01..03`) |
| embarcar | `embarcar-1..3` | water/splash (`splash_08..10`) |
| desembarcar | `desembarcar-1..3` | water/splash (`splash_12..14`) |
| construir | `construir-1..3` | Impact Sounds (`impactMining`) |
| moneda | `moneda-1..2` | RPG Audio (`handleCoins`) |
| cursor, seleccion, negado, menuAbrir, menuCerrar, boton, finDia, obraLista, convertir | uno cada uno | Interface Sounds |

## Música

También CC0, también comprobada en la página de cada pieza.

| Suena en | Archivo | Pieza y autor | De dónde |
|---|---|---|---|
| Menús y portada | `legend.mp3` | *A Legend Will Rise* — CodeManu | https://opengameart.org/content/a-legend-will-rise-orchestral |
| En partida | `field.mp3` | *The Field Of Dreams* — pauliuw | https://opengameart.org/content/the-field-of-dreams |
| En partida | `town.mp3` | *Town Theme RPG* — cynicmusic | https://opengameart.org/content/town-theme-rpg |
| Fin de partida | `pursuit.wav` | *Determined Pursuit* — Emma_MA | https://opengameart.org/content/determined-pursuit-epic-orchestra-loop |

Las dos de partida se turnan, así que una hora de juego no es un bucle.

**Sobre lo de "tan viejo que no tiene copyright":** no funciona así. El derecho
de autor dura unos 70 años desde la muerte del autor, no desde que salió el
juego, así que la música de Final Fantasy VII (1997) está protegida hasta bien
entrado el siglo que viene. Lo de arriba es libre porque sus autores lo
cedieron a propósito, no porque haya envejecido.

## Lo que sigue estando sintetizado, y por qué

| Sonido | Motivo |
|---|---|
| era, victoria, derrota, turno, captura, reclutar, investigar, curar, poder, reliquia | Son **musicales**, y los sintetizados están afinados en el mismo modo frigio que la música del juego. Una fanfarria grabada en otra tonalidad chocaría con el fondo. |
| carro | No encontré ningún carro ni galope en CC0. Lo que hay de caballos en OpenGameArt es CC-BY, que obliga a citar, y preferí no meter esa atadura por un solo sonido. |
| La música, como reserva | El compositor que escribe música sola sigue ahí. Si faltara un archivo, o si lo prefieres, se enciende con `musica.usarGrabada(false)` desde la consola. |

## Cómo cambiarlos

El reparto está en una sola tabla, al principio de `audio/muestras.js`. Para
cambiar un sonido basta con dejar otro archivo en `audio/muestras/` y cambiar
su línea. Si un archivo falta o no carga, ese sonido vuelve solo al
sintetizador: el juego nunca se queda mudo por eso.
