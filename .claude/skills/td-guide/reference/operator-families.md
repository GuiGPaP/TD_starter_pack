# Operator Families Reference

## Contents

1. [Family Overview](#family-overview)
2. [SOP vs POP](#sop-vs-pop)
3. [Cross-Family Patterns](#cross-family-patterns)
4. [Data Conversion Examples](#data-conversion-examples)
5. [Available Operators](#available-operators)
6. [Getting Operator Details](#getting-operator-details)

---

## Family Overview

TouchDesigner has 6 operator families. Each processes different data types but shares common design patterns.

| Family | Purpose | Data Type | Example Use |
|--------|---------|-----------|-------------|
| **SOP** | Surface/Geometry | 3D geometry (points, polygons, meshes) | Modeling, procedural geometry |
| **POP** | Point/Particle | GPU-based 3D points, particles | Particle systems, point clouds (GPU) |
| **TOP** | Texture | 2D images, video, textures | Image processing, compositing |
| **CHOP** | Channel | Time-based data, motion, audio | Animation, audio analysis, data streams |
| **DAT** | Data | Tables, text, scripts | Data manipulation, Python scripts |
| **COMP** | Component | Containers, 3D scenes, UI | Scene hierarchy, UI panels, networks |

---

## SOP vs POP

Both handle 3D geometry but differ in execution:

| Aspect | SOP | POP |
|--------|-----|-----|
| Execution | CPU | GPU |
| History | Legacy, stable | New (2025), experimental |
| Use case | Modeling, static geometry | Particles, large point clouds |
| Geometry COMP | Uses In/Out SOP | Uses In/Out POP |

**Key insight**: SOP and POP are conceptually similar. Patterns that work for SOP typically work for POP with renamed operators.

---

## Cross-Family Patterns

Operator families share common patterns. When working with an unfamiliar family, apply known patterns from other families.

### Universal Operators

Every family has these operators:

| Pattern | SOP | POP | TOP | CHOP | DAT |
|---------|-----|-----|-----|------|-----|
| Input | inSOP | inPOP | inTOP | inCHOP | inDAT |
| Output | outSOP | outPOP | outTOP | outCHOP | outDAT |
| Null | nullSOP | nullPOP | nullTOP | nullCHOP | nullDAT |
| Select | selectSOP | selectPOP | selectTOP | selectCHOP | selectDAT |
| Switch | switchSOP | switchPOP | switchTOP | switchCHOP | switchDAT |
| Merge | mergeSOP | mergePOP | compositeTOP | mergeCHOP | mergeDAT |

### Conversion Operators

Convert between families using `sourcetoTarget` naming:

```
soptoCHOP  - SOP points → CHOP channels (tx, ty, tz)
choptoSOP  - CHOP channels → SOP points
soptoPOP   - SOP geometry → POP points (CPU → GPU)
choptoPOP  - CHOP channels → POP points
poptoCHOP  - POP points → CHOP channels
choptoTOP  - CHOP → texture
toptoCHOP  - TOP pixels → CHOP channels
choptoDAT  - CHOP → table (rows = samples)
soptoDAT   - SOP → table (with P, N, etc.)
poptoDAT   - POP → table
```

### Applying Patterns to New Families

When encountering an unfamiliar operator family:

1. **Assume In/Out/Null exist** - they always do
2. **Try the same pattern** from a known family
3. **Check parameters** with `op.pars()` if names differ
4. **Use Context7** for specific operator details

---

## Data Conversion Examples

### SOP to CHOP

```python
sop2chop = parent.create(soptoCHOP, 'sopto1')
sop2chop.viewer = True
sop2chop.par.sop = 'null1'
# Generates channels: tx, ty, tz, nx, ny, nz, etc.
```

### CHOP to SOP

```python
chop2sop = parent.create(choptoSOP, 'chopto1')
chop2sop.viewer = True
chop2sop.par.chop = 'null_chop'
```

### CHOP to POP

```python
chop2pop = parent.create(choptoPOP, 'choptopop1')
chop2pop.viewer = True
chop2pop.par.chop = 'null_chop'
```

### SOP to POP

```python
sop2pop = parent.create(soptoPOP, 'soptopop1')
sop2pop.viewer = True
sop2pop.par.sop = op('null1')  # Requires op() reference, not string
```

### Points Only Won't Render

SOP points alone don't render - they need primitives.

**Solution**: Convert to particles:

```python
convert = parent.create(convertSOP, 'convert1')
convert.viewer = True
convert.par.totype = 'particlesperpoint'
convert.inputConnectors[0].connect(point_sop)
```

---

## Available Operators

### SOPs (113)
addSOP, alembicSOP, alignSOP, armSOP, attributeSOP, attributecreateSOP, basisSOP, blendSOP, bonegroupSOP, booleanSOP, boxSOP, bridgeSOP, cacheSOP, capSOP, captureSOP, captureregionSOP, carveSOP, choptoSOP, circleSOP, claySOP, clipSOP, convertSOP, copySOP, cplusplusSOP, creepSOP, curveclaySOP, curvesectSOP, dattoSOP, deformSOP, deleteSOP, divideSOP, extrudeSOP, facetSOP, facetrackSOP, fileinSOP, filletSOP, fitSOP, fontSOP, forceSOP, fractalSOP, gridSOP, groupSOP, holeSOP, importselectSOP, inSOP, inversecurveSOP, isosurfaceSOP, joinSOP, jointSOP, kinectSOP, latticeSOP, limitSOP, lineSOP, linethickSOP, lodSOP, lsystemSOP, magnetSOP, materialSOP, mergeSOP, metaballSOP, modelSOP, noiseSOP, nullSOP, objectmergeSOP, oculusriftSOP, openvrSOP, particleSOP, pointSOP, polyloftSOP, polypatchSOP, polyreduceSOP, polysplineSOP, polystitchSOP, poptoSOP, primitiveSOP, profileSOP, projectSOP, railsSOP, rasterSOP, raySOP, rectangleSOP, refineSOP, resampleSOP, revolveSOP, scriptSOP, selectSOP, sequenceblendSOP, skinSOP, sortSOP, sphereSOP, springSOP, sprinkleSOP, spriteSOP, stitchSOP, subdivideSOP, superquadSOP, surfsectSOP, sweepSOP, switchSOP, textSOP, textureSOP, torusSOP, traceSOP, trailSOP, transformSOP, trimSOP, tristripSOP, tubeSOP, twistSOP, vertexSOP, wireframeSOP, zedSOP

### POPs (99)
accumulatePOP, alembicPOP, analyzePOP, attributePOP, attributecombinePOP, attributeconvertPOP, blendPOP, boxPOP, cachePOP, cacheblendPOP, cacheselectPOP, choptoPOP, circlePOP, connectivityPOP, convertPOP, copyPOP, cplusplusPOP, curvePOP, dattoPOP, deletePOP, dimensionPOP, dmxfixturePOP, dmxoutPOP, extrudePOP, facetPOP, feedbackPOP, fieldPOP, fileinPOP, fileoutPOP, forceradialPOP, glslPOP, glsladvancedPOP, glslcopyPOP, glslcreatePOP, glslselectPOP, gridPOP, groupPOP, histogramPOP, importselectPOP, inPOP, limitPOP, linePOP, linebreakPOP, linedividePOP, linemetricsPOP, lineresamplePOP, linesmoothPOP, linethickPOP, lookupattributePOP, lookupchannelPOP, lookuptexturePOP, mathPOP, mathcombinePOP, mathmixPOP, mergePOP, neighborPOP, noisePOP, normalPOP, normalizePOP, nullPOP, oakselectPOP, outPOP, particlePOP, patternPOP, phaserPOP, planePOP, pointPOP, pointfileinPOP, pointgeneratorPOP, polygonizePOP, primitivePOP, projectionPOP, proximityPOP, quantizePOP, randomPOP, rayPOP, rectanglePOP, rerangePOP, revolvePOP, selectPOP, skinPOP, skindeformPOP, soptoPOP, sortPOP, spherePOP, sprinklePOP, subdividePOP, switchPOP, texturemapPOP, topologyPOP, toptoPOP, torusPOP, trailPOP, transformPOP, trigPOP, tubePOP, twistPOP, zedPOP

### TOPs (148)
addTOP, analyzeTOP, antialiasTOP, blobtrackTOP, bloomTOP, blurTOP, cacheTOP, cacheselectTOP, channelmixTOP, choptoTOP, chromakeyTOP, circleTOP, compositeTOP, constantTOP, convolveTOP, cornerpinTOP, cplusplusTOP, cropTOP, crossTOP, cubemapTOP, depthTOP, differenceTOP, directxinTOP, directxoutTOP, displaceTOP, edgeTOP, embossTOP, feedbackTOP, fitTOP, flexTOP, flipTOP, flowTOP, functionTOP, glslTOP, glslmultiTOP, hsvadjustTOP, hsvtorgbTOP, importselectTOP, inTOP, insideTOP, kinectTOP, kinectazureTOP, kinectazureselectTOP, layerTOP, layermixTOP, layoutTOP, leapmotionTOP, lensdistortTOP, levelTOP, limitTOP, lookupTOP, lumablurTOP, lumalevelTOP, mathTOP, matteTOP, mirrorTOP, monochromeTOP, moviefileinTOP, moviefileoutTOP, multiplyTOP, ndiinTOP, ndioutTOP, noiseTOP, normalmapTOP, nullTOP, opencolorioTOP, opticalflowTOP, opviewerTOP, outTOP, outsideTOP, overTOP, packTOP, photoshopinTOP, pointfileinTOP, pointfileselectTOP, pointtransformTOP, poptoTOP, prefiltermapTOP, projectionTOP, rampTOP, realsenseTOP, rectangleTOP, remapTOP, renderTOP, renderpassTOP, renderselectTOP, reorderTOP, resolutionTOP, rgbkeyTOP, rgbtohsvTOP, screenTOP, screengrabTOP, scriptTOP, selectTOP, sharedmeminTOP, sharedmemoutTOP, slopeTOP, spectrumTOP, ssaoTOP, substanceTOP, substanceselectTOP, subtractTOP, svgTOP, switchTOP, syphonspoutinTOP, syphonspoutoutTOP, textTOP, texture3dTOP, thresholdTOP, tileTOP, timemachineTOP, tonemapTOP, touchinTOP, touchoutTOP, transformTOP, underTOP, videodeviceinTOP, videodeviceoutTOP, videostreaminTOP, videostreamoutTOP, webrenderTOP, zedTOP, zedselectTOP

### CHOPs (171)
abletonlinkCHOP, analyzeCHOP, angleCHOP, attributeCHOP, audiobandeqCHOP, audiobinauralCHOP, audiodeviceinCHOP, audiodeviceoutCHOP, audiodynamicsCHOP, audiofileinCHOP, audiofileoutCHOP, audiofilterCHOP, audiomovieCHOP, audiondiCHOP, audiooscillatorCHOP, audioparaeqCHOP, audioplayCHOP, audiorenderCHOP, audiospectrumCHOP, audiostreaminCHOP, audiostreamoutCHOP, audiovstCHOP, beatCHOP, bindCHOP, blacktraxCHOP, blendCHOP, blobtrackCHOP, bodytrackCHOP, bulletsolverCHOP, clipCHOP, clipblenderCHOP, clockCHOP, compositeCHOP, constantCHOP, copyCHOP, countCHOP, cplusplusCHOP, crossCHOP, cycleCHOP, dattoCHOP, delayCHOP, deleteCHOP, dmxinCHOP, dmxoutCHOP, envelopeCHOP, etherdreamCHOP, eventCHOP, expressionCHOP, extendCHOP, facetrackCHOP, fanCHOP, feedbackCHOP, fileinCHOP, fileoutCHOP, filterCHOP, freedCHOP, functionCHOP, gestureCHOP, handleCHOP, heliosdacCHOP, hogCHOP, hokuyoCHOP, holdCHOP, importselectCHOP, inCHOP, infoCHOP, interpolateCHOP, inversecurveCHOP, inversekinCHOP, joinCHOP, joystickCHOP, keyboardinCHOP, keyframeCHOP, kinectCHOP, kinectazureCHOP, lagCHOP, laserCHOP, laserdeviceCHOP, leapmotionCHOP, lfoCHOP, limitCHOP, logicCHOP, lookupCHOP, ltcinCHOP, ltcoutCHOP, mathCHOP, mergeCHOP, midiinCHOP, midiinmapCHOP, midioutCHOP, mouseinCHOP, mouseoutCHOP, noiseCHOP, nullCHOP, objectCHOP, oculusriftCHOP, openvrCHOP, oscinCHOP, oscoutCHOP, outCHOP, overrideCHOP, panelCHOP, pangolinCHOP, parameterCHOP, patternCHOP, performCHOP, phaserCHOP, pipeinCHOP, pipeoutCHOP, poptoCHOP, pulseCHOP, realsenseCHOP, recordCHOP, renameCHOP, renderpickCHOP, reorderCHOP, replaceCHOP, resampleCHOP, scanCHOP, scriptCHOP, scurveCHOP, selectCHOP, sequencerCHOP, serialCHOP, sharedmeminCHOP, sharedmemoutCHOP, shiftCHOP, shuffleCHOP, slopeCHOP, soptoCHOP, sortCHOP, speedCHOP, spliceCHOP, springCHOP, stretchCHOP, switchCHOP, syncinCHOP, syncoutCHOP, tabletCHOP, timecodeCHOP, timelineCHOP, timerCHOP, timesliceCHOP, toptoCHOP, touchinCHOP, touchoutCHOP, trailCHOP, transformCHOP, triggerCHOP, trimCHOP, warpCHOP, waveCHOP, zedCHOP

### DATs (75)
artnetDAT, chopexecuteDAT, choptoDAT, clipDAT, convertDAT, cplusplusDAT, datexecuteDAT, errorDAT, etherdreamDAT, evaluateDAT, examineDAT, executeDAT, fifoDAT, fileinDAT, fileoutDAT, folderDAT, inDAT, indicesDAT, infoDAT, insertDAT, jsonDAT, keyboardinDAT, lookupDAT, mergeDAT, midieventDAT, midiinDAT, monitorsDAT, mqttclientDAT, multitouchinDAT, ndiDAT, nullDAT, opexecuteDAT, opfindDAT, oscinDAT, oscoutDAT, outDAT, panelexecuteDAT, parameterDAT, parameterexecuteDAT, performDAT, poptoDAT, renderpickDAT, reorderDAT, scriptDAT, selectDAT, serialDAT, socketioDAT, soptoDAT, sortDAT, substituteDAT, switchDAT, tableDAT, tcpipDAT, textDAT, touchinDAT, touchoutDAT, transposeDAT, tuioinDAT, udpinDAT, udpoutDAT, videodevicesDAT, webDAT, webclientDAT, webrtcDAT, webserverDAT, websocketDAT, xmlDAT

### COMPs (42)
actorCOMP, ambientlightCOMP, animationCOMP, annotateCOMP, baseCOMP, blendCOMP, boneCOMP, bulletsolverCOMP, buttonCOMP, cameraCOMP, camerablendCOMP, constraintCOMP, containerCOMP, engineCOMP, environmentlightCOMP, fbxCOMP, fieldCOMP, forceCOMP, geometryCOMP, geotextCOMP, glslCOMP, handleCOMP, lightCOMP, listCOMP, nullCOMP, nvidiaflexsolverCOMP, opviewerCOMP, parameterCOMP, replicatorCOMP, selectCOMP, sharedmeminCOMP, sharedmemoutCOMP, sliderCOMP, tableCOMP, textCOMP, timeCOMP, usdCOMP, widgetCOMP, windowCOMP

### MATs (14)
constantMAT, depthMAT, glslMAT, inMAT, lineMAT, nullMAT, outMAT, pbrMAT, phongMAT, pointspriteMAT, selectMAT, switchMAT, wireframeMAT

---

## Getting Operator Details

Use `/ui/dialogs/parGrabber/offlineHelp` DAT to get operator summaries and parameter info:

```python
import json
help_data = json.loads(op('/ui/dialogs/parGrabber/offlineHelp').text)

# Get operator summary
summary = help_data['help']['POPs']['spherePOP']['summary']

# List all operators in a family
pop_ops = list(help_data['help']['POPs'].keys())

# Get parameter info
params = help_data['help']['POPs']['spherePOP']['parameters']
for name, info in params.items():
    print(f"{name}: {info['summary']}")
```
