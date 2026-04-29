// utils/detectorLimit.ts — permissions.ts re-export shim
// Yeni kod utils/permissions.ts'den direkt import etmeli.
export {
  DETECTOR_SESSION_MS,
  type DetectorState,
  type DetectorStartResult,
  loadDetectorState,
  detectorKalanSaniye,
  isDetectorSessionActive,
  markDetectorSessionStart,
  markDetectorSessionEnd,
} from './permissions';
