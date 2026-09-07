# Animation Pipeline

Current implementation: CSS breathing previews of SVG concepts and downloadable motion briefs. There are no generated skeletal animations or production 3D models.

Required first clips: idle (2-second seamless loop), discover (1-second curious glance), attack (1.5-second anticipation/impact/recovery), befriend (2-second joyful response). Add walk only when movement integration is ready.

Rig contract: consistent units, origin at feet, named root and deform bones, no accidental root motion, separate source and runtime exports. Use a neutral-lighting preview and a documented engine import preset. Final format and budgets follow the chosen mobile engine, rather than assuming a format alone guarantees compatibility.

Quality gate: clear silhouettes at phone scale, no foot sliding, clean loop seams, no clipping, readable attack timing, reduced-motion alternative. Review memory and frame time on actual lower-end devices. Store source files, exports, clip list, creator/license information and revision in the asset manifest.
