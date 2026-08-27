// booth/pose-engine.mjs — MediaPipe PoseLandmarker(web) 래퍼
import { FilesetResolver, PoseLandmarker } from '../vendor/mediapipe/tasks-vision/vision_bundle.mjs';

export async function createPoseEngine({
  wasmPath = '../vendor/mediapipe/tasks-vision/wasm',
  modelPath = '../vendor/mediapipe/pose_landmarker_lite.task',
  delegate = 'GPU',   // GPU(WebGL) 추론 = 지연 대폭 감소. 실패하면 CPU로 자동 폴백.
} = {}) {
  const fileset = await FilesetResolver.forVisionTasks(wasmPath);

  const build = (dg) => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelPath, delegate: dg },
    runningMode: 'VIDEO',
    numPoses: 1,
    outputSegmentationMasks: false,   // 안 쓰는 마스크 생성을 끈다(프레임당 비용 절감)
    // 추적 신뢰도를 낮게 잡으면 무거운 "사람 찾기" 검출기를 다시 도는 빈도가 줄어
    // 프레임당 지연이 안정된다. 부스는 한 명이 카메라 앞에 계속 서 있는 상황이라
    // 추적을 놓칠 위험보다 지연이 튀는 쪽이 더 손해다.
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.3,
  });

  let landmarker;
  try {
    landmarker = await build(delegate);
    console.log('[pose] delegate =', delegate);
  } catch (e) {
    if (delegate !== 'CPU') {
      console.warn('[pose] GPU delegate 실패 → CPU 폴백', e);
      landmarker = await build('CPU');
    } else {
      throw e;
    }
  }
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
