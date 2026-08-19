// booth/pose-engine.mjs — MediaPipe PoseLandmarker(web) 래퍼
import { FilesetResolver, PoseLandmarker } from '../vendor/mediapipe/tasks-vision/vision_bundle.mjs';

export async function createPoseEngine({
  wasmPath = '../vendor/mediapipe/tasks-vision/wasm',
  modelPath = '../vendor/mediapipe/pose_landmarker_lite.task',
} = {}) {
  const fileset = await FilesetResolver.forVisionTasks(wasmPath);
  const landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelPath },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
  let lastTs = 0;
  return {
    detect(videoEl, timestampMs) {
      let ts = Math.floor(timestampMs);
      if (ts <= lastTs) ts = lastTs + 1;
      lastTs = ts;
      const res = landmarker.detectForVideo(videoEl, ts);
      const lms = res && res.landmarks && res.landmarks[0];
      return lms || null;
    },
    close() { landmarker.close(); },
  };
}
