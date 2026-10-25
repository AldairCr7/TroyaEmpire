# Lo que tiene el original, y lo que falta en Troya

Vaciado del **Age of Empires: The Age of Kings** de Nintendo DS (Backbone
Entertainment / Majesco, 2006), que es el juego en el que está basado Troya.
Comprobado el **23 de octubre de 2026** en el wiki de la serie (CC-BY-SA):
las páginas de *Unit*, *Building*, *Technology tree* y las cinco civilizaciones.

**Decisión tomada:** entra todo, haya equivalente homérico o no. Un caballero
con armadura de placas en la Tróade es un disparate histórico, pero el juego es
tuyo y lo que se quiere es el original completo. Donde hay un nombre griego
razonable lo propongo; donde no, se queda el nombre del original.

---

## 0. La fórmula de daño exacta

Sacada de la guía de estrategia de *iloveaoe* (GameFAQs, 2011), con sus
ejemplos numéricos. Es lo más valioso de toda la investigación:

```
fuerza de ataque   = ataque  × (vida actual / vida máxima)
fuerza de defensa  = defensa × (vida actual / vida máxima)

% de vida que pierde el defensor = fuerza de ataque / (2 × fuerza de defensa) × 100
```

Con dos topes: si las dos fuerzas son iguales, el defensor pierde **justo la
mitad**; si el ataque llega al **doble** de la defensa, **muere**.

**Cuatro diferencias con lo que hace Troya hoy:**

| | El original | Troya |
|---|---|---|
| Constante | daño = **50** × atq/def (que es 100/2) | **40** × atq/def |
| La vida del **defensor** | También baja su defensa | **No la baja** |
| Las bonificaciones del tipo (+33% contra infantería, −50% contra edificios) | Suben **ataque y defensa** de quien las tiene | Solo multiplican el daño |
| El terreno | Se suma sobre el valor **base**: `(80% de 125) + (40% de 125)` | Multiplica el total |

La segunda es la que más cambia el juego: en el original, **una unidad herida
también es más fácil de matar**, no solo pega menos. Eso hace que rematar sea
mucho más valioso y que las bolas de nieve sean más rápidas.

**Y el contraataque solo existe cuerpo a cuerpo.** Si disparas desde dos
casillas, no hay respuesta. Si disparas desde una casilla, sí la hay. Troya ya
lo hace así.

Cifras base confirmadas de algunas unidades: Caballería Ligera **150/150**,
Arquero **150/100**, Hombre de Armas **150/150**, Arquero Galés **175/125**.
Las cintas dan **+15% cada una**, a ataque y defensa, y se gana una **cada 3
combates** (cada 2 con *Veterano Curtido*). Pararse en un edificio cura **+20**.

---

## 1. Las reglas de combate del original

Esto es lo que gobierna todo lo demás. **Troya ya cumple casi todo:**

| Regla | ¿La tiene Troya? |
|---|---|
| Infantería y asedio: **+33% contra edificios** | Sí |
| Arqueros y caballería: **−50% contra edificios** | Sí |
| Infantería y caballería atacan solo **en cruz**, no en diagonal | Sí |
| A distancia y asedio atacan desde lejos | Sí |
| **El ataque baja conforme baja la vida** | Sí |
| El atacante pega primero casi siempre | Sí |
| Las unidades **se mejoran solas al subir de era** | Sí |
| Cuatro eras: Oscura, Feudal, Castillos, Imperial | Sí (Campamento, Asedio, Héroes, Leyenda) |
| Pararse encima de un edificio **cura** | Sí |
| Los edificios dan **+20% de defensa**; castillo y torre, **+40%**; granja, +10% | **No** |
| Los edificios **anulan la penalización de movimiento**: cruzarlos cuesta 1 | **No** |
| El enemigo **no puede atravesar** tus edificios; tú sí, pero sin pararte | **No** |
| Un edificio dañado **produce menos**: al 50% de vida, la mitad de recursos | **No** |
| Reparar cuesta el % del precio que le falte de vida, y es **instantáneo** | Parcial (cura 60 fijo) |
| Todo edificio se levanta en **un solo turno** | No (Troya tarda turnos) |

---

## 2. El roster completo — 45+ unidades

Cada columna es la era en que aparece. La flecha es mejora automática.

### Centro Urbano
- **Aldeano** (todas las eras)

### Iglesia
- **Monje** → **Monje de Élite**
- El **héroe** de la civilización

### Cuartel
- **Milicia** → **Hombre de Armas** → **Espadachín Largo** → **Espadachín a Dos Manos**
- **Lancero** → **Piquero** → **Piquero de Élite**
- **Campeón** (imperial, requiere investigar *Arena*)
- **Piquero Suizo** (mercenario: piquero de élite europeo)
- **Doppelsöldner** (mercenario: espadachín a dos manos europeo)

### Establo
- **Caballería Explorador**
- **Camello** → **Camello Pesado**
- **Caballería Ligera** → **Caballero** → **Caballero Montado**
- **Paladín** (imperial, requiere investigar *Escuderos*)
- **Caballero de la Mesa Redonda** (mercenario)

### Galería de Tiro
- **Arquero** → **Arquero de Élite**
- **Escaramuceador** → **de Élite** → **Experto**
- **Ballestero** → **Arbalestero**
- **Arquero a Caballo** → **Arquero a Caballo Pesado**
- **Arquero Galés** (mercenario), **Ballestero Genovés** (mercenario)
- **Arcabucero** (imperial, requiere investigar *Química*)

### Taller de Asedio
- **Ariete** → **Ariete de Asedio**
- **Escorpión** → **Escorpión Pesado**
- **Onagro** → **Cañón de Bombarda**
- **Ariete Oscuro** y **Mons Meg** (desbloqueables)
- Casi todo el asedio pesado requiere investigar *Ingenieros de Asedio*

### Castillo ← **este edificio no existe en Troya**
- La **unidad única** de la civilización → su versión de élite
- **Espadachín Largo** → **Espadachín a Dos Manos**
- **Trebuchet** (requiere *Ingenieros de Asedio*)
- **War Wolf** (trebuchet desbloqueable)

### Mercado
- Todas las unidades normales de las eras anteriores, **pagando en oro**
- **Tres mercenarios distintos al azar cada día** ← mecánica que Troya no tiene
- Los seis mercenarios son las unidades únicas de las civilizaciones que no
  salen en la versión de DS: **Woad Raider** celta, **Berserker** vikingo,
  **Templario**, **Jenízaro** turco, **Elefante de Guerra** persa y
  **Chu Ko Nu** chino. Todos con su versión de élite.

**Lo que el original NO tiene:** unidades navales de combate. Solo barcos de
transporte, y ni siquiera los controla el jugador. Troya tiene más que el
original aquí (nave de guerra, pentecóntera, muelle).

---

## 3. Los edificios — 15 en total

| Edificio | Para qué sirve |
|---|---|
| **Centro Urbano** | Entrena aldeanos, investiga, comercia. Ocupa **3×3**. Deben estar a 5 casillas entre sí. Produce 25 comida + 25 oro al día. **Permite construir los edificios de ciudad**, y **captura los edificios de ciudad que se queden sin centro** |
| **Cuartel** | Entrena y mejora infantería |
| **Establo** | Entrena y mejora caballería |
| **Galería de Tiro** | Entrena y mejora arqueros |
| **Taller de Asedio** | Entrena y mejora máquinas |
| **Mercado** | Comercia, y ofrece **tres mercenarios al azar cada día** |
| **Iglesia** | Entrena monjes. **Guarda una reliquia** y genera 100 oro al día con ella. Si la destruyen, la reliquia vuelve al suelo |
| **Herrería** | ← **falta en Troya.** Mejora infantería, caballería y arqueros |
| **Universidad** | ← **falta en Troya.** Mejora edificios, arqueros y asedio |
| **Torre** | Solo en las **esquinas** de la cuadrícula 3×3 de la ciudad. +40% defensa. No investiga nada |
| **Castillo** | ← **falta en Troya.** Base avanzada, 2×2, **se construye lejos de la ciudad**. +40% defensa. **El único que se puede levantar en montaña** — y eso deja pasar al asedio por la montaña. Entrena la unidad única, el espadachín largo y el trebuchet |
| **Maravilla** | Victoria por maravilla. 2×2, lejos de la ciudad |
| **Mina** | Sobre un yacimiento de oro. 150 oro/día (245 con todo investigado) |
| **Molino** | 50 comida/día. Permite **4 granjas adyacentes**. Puede capturar granjas sin dueño |
| **Granja** | 50 comida/día. Estorban tanto que sirven de muro |

---

## 4. El árbol tecnológico, con sus prerrequisitos

**Esta es la parte que más cambia Troya.** Ahora mismo las 50 tecnologías solo
piden estar en la era correcta — no piden **ningún edificio**. En el original
cada tecnología vive dentro de un edificio concreto, y sin ese edificio no
existe.

| Edificio | Investigaciones |
|---|---|
| **Mina** | Minería Avanzada → Minería de Pozo |
| **Molino** | Collera → Arado Pesado → Rotación de Cultivos |
| **Centro Urbano** | Telar, Suelas de Cuero, Carretilla, Carro de Mano, Exploradores, Guardia, Patrulla |
| **Cuartel** | Herreros, Rastreo, Conscripción, **Arena** (desbloquea el Campeón) |
| **Establo** | Cría Caballar, **Escuderos** (desbloquea el Paladín) |
| **Galería de Tiro** | Torneos de Arquería, Flechas Incendiarias |
| **Taller de Asedio** | Gremio de Mecánicos |
| **Mercado** | Acuñación → Banca; Comercio → Red Mercantil; Cartografía → Gremios |
| **Iglesia** | Fe, Redención, Iluminación, Fervor, Imprenta, Santidad, Expiación |
| **Herrería** | Empenaje → Punta de Bodkin → Brazales (ataque a distancia); Armadura Acolchada → de Cuero → de Anillas (defensa de infantería); Forja → Fundición → Alto Horno (ataque cuerpo a cuerpo); Cota de Malla → Placas; Barda de Malla → Barda de Placas |
| **Universidad** | Mampostería → Arquitectura; Aspilleras, Grúa; **Ingenieros de Asedio**; **Química**; Balística |
| **Castillo** | Zapadores, Empalizadas, Espías |

**Las cuatro cadenas duras**, que son lo que da forma a la partida:
1. **Arena** (cuartel, imperial) → desbloquea el **Campeón**
2. **Escuderos** (establo) → desbloquea el **Paladín**
3. **Química** (universidad) → desbloquea **Arcabucero**, **Cañón de Bombarda** y **Mons Meg**
4. **Ingenieros de Asedio** (universidad) → desbloquea **Escorpión Pesado**, **Ariete de Asedio**, **Trebuchet**, **Ariete Oscuro** y **War Wolf**

O sea: **sin universidad no hay asedio pesado ni pólvora**. Y **sin castillo no
hay unidad única ni trebuchet**. Eso es justo lo que pedías.

---

## 5. Las cinco civilizaciones

Cada una tiene: **un enfoque**, **una unidad única** (del castillo), **un héroe
con cuatro poderes**, una lista de **descuentos** y otra de **recargos**.

Troya ya copia esta estructura — seis casas con bono y unidad única, héroes con
cuatro poderes — pero **le falta lo de los descuentos y recargos**, que en el
original es la mitad del carácter de cada bando.

| Civilización | Enfoque | Única | Héroe |
|---|---|---|---|
| **Britanos** | Arqueros a pie | Arquero Largo | Ricardo Corazón de León |
| **Francos** | Caballería | Lanzador de Hachas | Juana de Arco |
| **Japoneses** | Piqueros y ballestas | Samurái | Minamoto Yoshitsune |
| **Mongoles** | Arqueros a caballo e investigación | Mangudai | Gengis Kan |
| **Sarracenos** | Camellos | Mameluco | Saladino |

### Los veinte poderes de héroe, tal cual

**Ricardo Corazón de León** (britano)
- *Temerario y Fiero* — los enemigos adyacentes o en diagonal pierden 20 de vida
- *Líder Soberbio* — los aliados a su vista ganan +25% de ataque
- *Reclutad por la Causa* — todas las unidades del día cuestan −20 comida y −20 oro. Solo desde el centro urbano
- *Línea de Tiro* — todos los arqueros a su vista ganan **+1 de alcance** ese turno

**Juana de Arco** (franca)
- *Inspiración* — ella y los adyacentes ganan 20 de vida
- *Propósito Divino* — **todos** los aliados ganan 5 de vida
- *Fe Ciega* — los enemigos a su vista pierden **−25% de defensa** un turno
- *Resolución Quebrada* — los enemigos adyacentes o en diagonal pierden 25 de vida

**Minamoto Yoshitsune** (japonés)
- *Pillaje* — los aliados ganan +50% de ataque contra **molinos, minas y granjas**
- *Código del Guerrero* — las unidades del día cuestan −20/−20. Solo desde el centro urbano
- *Guardia de Minamoto* — los adyacentes ganan **+33% de ataque y de defensa**
- *General Inspirador* — él y los adyacentes ganan +15 de vida

**Gengis Kan** (mongol)
- *Mecenas de las Artes* — la investigación del día cuesta −50/−50. Solo desde el centro urbano
- *Viaje Nómada* — los adyacentes y diagonales ganan **+5 de movimiento**
- *Asedio Arrollador* — los aliados a su vista ganan +33% contra **edificios**
- *Terror Mongol* — los enemigos a su vista pierden −25% de defensa

**Saladino** (sarraceno)
- *Benefactor* — **+100 de oro** al tesoro. Solo desde el centro urbano
- *Lluvia de Flechas* — los arqueros a su vista ganan +33% de ataque
- *Aura de Invencibilidad* — los aliados a su vista ganan **+33% de defensa**
- *Golpear y Huir* — los adyacentes ganan +2 de movimiento y +25% de ataque

> Cuatro de los cinco héroes tienen un poder que **solo funciona pisando el
> centro urbano**. Troya ya copió ese patrón con la Llamada del Campeón de
> Aquiles y el Rescate Real de Paris — iba bien encaminado.

### Descuentos y recargos

Cada civilización abarata unas cosas y encarece otras. Ejemplo britano:
barato la galería de tiro, la iglesia, ballesteros, espadachines y campeones;
caro los camellos, arqueros a caballo, onagros y cañones.

Esto en Troya **no existe**, y es lo que haría que Esparta se *sienta* distinta
de Micenas más allá de un porcentaje.

---

## 5b. Las 22 habilidades de unidad del original

De la *Unit Skill Guide* de **Raestloz** (GameFAQs, 2008). Esto es el "cada
unidad con su habilidad" que pedías: en el original casi toda unidad tiene al
menos una, y son ellas las que crean el piedra-papel-tijera.

Marcadas con **✓** las que Troya ya tiene.

| Habilidad | Quién la lleva | Qué hace | ¿Está? |
|---|---|---|---|
| **Construir** | Aldeanos | Levantar edificios | ✓ |
| **Poderes de héroe** | Héroes | Cuatro poderes propios | ✓ |
| **Anticaballería** | Lanceros, piqueros, piqueros suizos, Minamoto | Más ataque y defensa contra caballería, **y golpea primero** aunque le ataquen | ✓ (`antiChariot`) |
| **Carga en llanura** | Caballería ligera, caballeros, paladines, templarios, Ricardo | Más ataque al iniciar el ataque **sobre llanura o camino de llanura** | ✓ (`plainsCharge`) |
| **Carga en desierto** | Camellos, mamelucos, Saladino | Lo mismo, pero en desierto | Parcial |
| **Escaramuza** | Escaramuceadores, lanzadores de hachas | **Golpea primero**, solo en cuerpo a cuerpo | ✓ (`skirmish`) |
| **Primer golpe** | Mangudai, Gengis Kan | Golpea primero **de lejos y de cerca** | ✗ |
| **Andanada** | Arqueros largos | Mucho más ataque, atacando y defendiendo, **solo si tiene más de 50 de vida** | ✗ |
| **Leñador** | Lanzadores de hachas | Más ataque **en bosque** | ✗ |
| **Asusta Caballos** | Camellos, mamelucos, Saladino | Baja el ataque del enemigo, **solo contra caballos** (no elefantes) | ✗ |
| **Veterano curtido** | Samuráis | Gana cinta cada **2** combates en vez de 3 | ✓ (`seasonedVeteran`) |
| **Celo** | Templarios | **Recupera vida tras cada combate**, salvo contra asedio y edificios | ✗ |
| **No mover y atacar** | Ballesteros, escorpiones, onagros, trebuchets, cañones, jenízaros, Chu Ko Nu | O se mueve o ataca, no las dos | ✓ (`noMoveAndAttack`) |
| **Solo edificios** | Arietes | No puede atacar unidades | ✓ (`buildingsOnly`) |
| **Solo unidades** | Escorpiones | No puede atacar edificios | ✗ |
| **Causar miedo** | Woad Raiders, elefantes | Baja el ataque del enemigo **siempre**, y su defensa cuando ataca | ✗ |
| **Convertir** | Monjes | Convierte a 2 casillas; mejor pegado. Nunca al 100% | ✓ |
| **Curar** | Monjes | 20 de vida, 23 con *Redención*. El monje de élite, 30 / 34 / **39** | ✓ (fijo en 30) |
| **Fuego rápido** | Chu Ko Nu | **Dobla** el ataque, atacando y defendiendo | ✗ |
| **Frenesí** | Berserkers | El ataque **no baja** aunque baje la vida | ✓ (`frenzy`) |
| **Alcance mínimo 2** | Trebuchets | **No puede atacar a quien tenga pegado** | ✗ |
| **Explorador** | Caballería explorador | Se mueve más lejos **en terreno sin explorar** | ✓ (`scout`) |

> Detalle fino de la guía: las habilidades de terreno (carga en llanura, en
> desierto, leñador) **siguen funcionando aunque el objetivo esté dentro de un
> edificio**, si el edificio está construido sobre ese terreno.

Troya lleva **11 de 22**. Las que faltan son casi todas de unidades que
tampoco existen todavía, así que entran juntas.

---

## 6. La lista de trabajo

Ordenada por lo que más cambia el juego, de más a menos.

### A. Los tres edificios que faltan y los prerrequisitos
**Lo más importante de todo lo que pediste.** Herrería, Universidad y Castillo,
y repartir las 50 tecnologías de Troya entre los edificios, con sus cadenas.
Hay que tocar: `buildings.js`, `technologies.js` (añadir campo `edificio` y
`requiere`), `researchOptions()` en el motor, el diálogo de tecnologías, y la IA
para que construya lo que necesita antes de investigar.

### B. El roster que falta
Troya tiene 39 unidades contra las 45+ del original, pero sobre todo le faltan
**líneas enteras**:
- **Camello** → Camello Pesado (el antídoto contra caballería)
- **Escorpión** → Escorpión Pesado (el asedio que dispara a unidades, no a muros)
- **Onagro**, **Trebuchet**
- **Arquero a Caballo** → pesado
- **Monje** → Monje de Élite (Troya tiene sacerdote, pero sin línea de mejora)
- **Los seis mercenarios** con sus élites, y la rotación de tres al día
- La **pólvora**: arcabucero, cañón, Mons Meg (si quieres que entre tal cual)

### C. Las reglas de edificio
Defensa por edificio (+20%, +40% castillo y torre, +10% granja), atravesar
edificios, producción reducida al estar dañados, reparación proporcional e
instantánea, construcción en un turno.

### D. Descuentos y recargos por casa
Dos listas por casa. Es barato de hacer y cambia mucho el carácter.

### E. Las tres cuadrículas
Centro urbano de **3×3**, castillo y maravilla de **2×2**, torres solo en las
esquinas, centros a 5 casillas entre sí. Esto es lo más caro de todo, porque
obliga a tocar el tablero, el renderizador y la colocación. **Yo lo dejaría
para el final, o fuera.**

---

## 7. Lo que NO pude verificar

- **Las cifras exactas de cada unidad** (ataque, defensa, movimiento, alcance,
  precio). Las páginas sueltas de cada unidad en el wiki están vacías. Las
  tendría que sacar de una guía de GameFAQs, o deducirlas de la progresión que
  Troya ya tiene, que es coherente (100 → 150 → 200 → 250).
- **Los multiplicadores exactos de contra quién** (cuánto pega un piquero a un
  caballero, un camello a la caballería, un escaramuceador a un arquero). Las
  parejas son las canónicas de la saga y las sé, pero **las cifras del DS no las
  tengo confirmadas**.
- **El precio exacto** de cada unidad y edificio.

Las habilidades sí las tengo todas (ver 5b), y la fórmula de daño también.

---

## 9. Decisiones ya tomadas

- **Entra todo**, haya equivalente homérico o no. Incluida la pólvora.
- **Los nombres se quedan tal cual** los del original.
- **Las cuadrículas no se tocan**: todo sigue ocupando una casilla.
- **Fuera la flota.** Muelle, nave de transporte, nave de guerra, pentecóntera,
  embarcar y desembarcar. El original no tiene unidades navales de combate, y
  se puede jugar sin eso. Esto además cierra el pendiente de la IA anfibia, que
  nunca supo subir tropa a los barcos.
