"""
DN FACE - AI Face Recognition Engine
Uses face_recognition + OpenCV for detection, embedding, matching.
"""

import base64
import numpy as np
from typing import Optional, List, Dict, Tuple

# face_recognition wraps dlib's deep face embeddings (128-d vector)
try:
    import face_recognition
    FACE_RECOGNITION_AVAILABLE = True
except BaseException as exc:
    # face_recognition may call sys.exit when models are missing
    FACE_RECOGNITION_AVAILABLE = False
    print(f"[WARNING] face_recognition unavailable ({exc}). Using mock mode.")

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    print("[WARNING] opencv-python not installed. Using mock mode.")


TOLERANCE = 0.55   # Lower = stricter matching (real model)
MOCK_TOLERANCE = 6.0  # Higher = more lenient (demo mode)


class FaceEngine:
    """
    Core face recognition module.

    Functions:
        detect_face()        - Check if frame contains a face
        generate_embedding() - Extract 128-d face descriptor
        compare_faces()      - Compare two embeddings
    """

    def __init__(self):
        self.available = FACE_RECOGNITION_AVAILABLE and CV2_AVAILABLE
        if self.available:
            print("[FaceEngine] Initialized with face_recognition + OpenCV")
        else:
            print("[FaceEngine] Running in DEMO/MOCK mode (install face_recognition + opencv-python)")

    # ─────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────

    def extract_embedding_from_base64(self, image_b64: str) -> Optional[list]:
        """
        Decode base64 image, detect face, return 128-d embedding as list.
        Returns None if no face detected.
        """
        img = self._decode_base64_image(image_b64)
        if img is None:
            return None
        return self._generate_embedding(img)

    def extract_embeddings_from_base64(self, image_b64: str) -> List[list]:
        """
        Decode base64 image, detect faces, return list of embeddings.
        Returns empty list if no faces detected.
        """
        img = self._decode_base64_image(image_b64)
        if img is None:
            return []
        return self._generate_embeddings(img)

    def find_best_match(
        self,
        query_embedding: list,
        all_embeddings: List[Dict],
    ) -> Optional[Tuple[str, float]]:
        """
        Compare query embedding against all stored embeddings.
        Returns (user_id, confidence) of best match, or None.
        """
        return self.compare_faces(query_embedding, all_embeddings)

    def find_matches(
        self,
        query_embeddings: List[list],
        all_embeddings: List[Dict],
    ) -> List[Tuple[str, float]]:
        """
        Compare multiple query embeddings against all stored embeddings.
        Returns list of (user_id, confidence) matches.
        """
        results = []
        for emb in query_embeddings:
            match = self.compare_faces(emb, all_embeddings)
            if match:
                results.append(match)
        # Keep best confidence per user
        best = {}
        for user_id, conf in results:
            if user_id not in best or conf > best[user_id]:
                best[user_id] = conf
        return [(u, c) for u, c in best.items()]

    def count_faces_in_base64(self, image_b64: str) -> int:
        """Count number of faces in a base64-encoded image."""
        img = self._decode_base64_image(image_b64)
        if img is None:
            return 0
        return self._count_faces(img)

    def validate_liveness_from_base64_frames(self, image_frames_b64: List[str]) -> Dict:
        """
        Practical anti-spoofing check from a short webcam sequence.

        We verify:
        - a face is visible across multiple frames
        - the video is not static
        - either head position changes or eye openness changes
        """
        frames = [self._decode_base64_image(frame) for frame in (image_frames_b64 or [])]
        frames = [frame for frame in frames if frame is not None]
        if len(frames) < 3:
            return {"passed": False, "reason": "Need more live frames"}

        motion_score = self._motion_score(frames)

        if not self.available:
            return {
                "passed": motion_score > 4.0,
                "reason": "motion_only",
                "motion_score": round(motion_score, 3),
                "turn_delta": 0.0,
                "blink_delta": 0.0,
            }

        samples = []
        for frame in frames:
            locations = face_recognition.face_locations(frame)
            if not locations:
                continue
            top, right, bottom, left = locations[0]
            width = max(right - left, 1)
            landmarks = face_recognition.face_landmarks(frame, [locations[0]])
            nose_ratio = None
            eye_ratio = None
            if landmarks:
                face_map = landmarks[0]
                nose_points = face_map.get("nose_tip") or face_map.get("nose_bridge") or []
                if nose_points:
                    nose_x = float(np.mean([point[0] for point in nose_points]))
                    nose_ratio = (nose_x - left) / width
                left_eye = face_map.get("left_eye") or []
                right_eye = face_map.get("right_eye") or []
                if left_eye and right_eye:
                    eye_ratio = (
                        self._eye_open_ratio(left_eye) +
                        self._eye_open_ratio(right_eye)
                    ) / 2.0

            samples.append(
                {
                    "nose_ratio": nose_ratio,
                    "eye_ratio": eye_ratio,
                }
            )

        if len(samples) < 3:
            return {"passed": False, "reason": "No stable live face detected", "motion_score": round(motion_score, 3)}

        nose_values = [sample["nose_ratio"] for sample in samples if sample["nose_ratio"] is not None]
        eye_values = [sample["eye_ratio"] for sample in samples if sample["eye_ratio"] is not None]
        turn_delta = (max(nose_values) - min(nose_values)) if len(nose_values) >= 2 else 0.0
        blink_delta = (max(eye_values) - min(eye_values)) if len(eye_values) >= 2 else 0.0

        passed = motion_score > 3.0 and (turn_delta > 0.04 or blink_delta > 0.012)
        return {
            "passed": passed,
            "reason": "live" if passed else "spoof_suspected",
            "motion_score": round(motion_score, 3),
            "turn_delta": round(turn_delta, 4),
            "blink_delta": round(blink_delta, 4),
        }

    # ─────────────────────────────────────────────
    # Core Functions
    # ─────────────────────────────────────────────

    def detect_face(self, image_rgb: np.ndarray) -> bool:
        """Return True if at least one face is found in image."""
        if not self.available:
            return True  # mock
        locations = face_recognition.face_locations(image_rgb)
        return len(locations) > 0

    def generate_embedding(self, image_rgb: np.ndarray) -> Optional[list]:
        """
        Generate 128-dimensional face embedding from an RGB image.
        Returns list of floats or None if no face found.
        """
        if not self.available:
            return self._mock_embedding(image_rgb)

        locations = face_recognition.face_locations(image_rgb)
        if not locations:
            return None
        encodings = face_recognition.face_encodings(image_rgb, locations)
        if not encodings:
            return None
        return encodings[0].tolist()

    def generate_embeddings(self, image_rgb: np.ndarray) -> List[list]:
        """
        Generate embeddings for all detected faces in an RGB image.
        Returns list of 128-d embeddings.
        """
        if not self.available:
            emb = self._mock_embedding(image_rgb)
            return [emb] if emb is not None else []

        locations = face_recognition.face_locations(image_rgb)
        if not locations:
            return []
        encodings = face_recognition.face_encodings(image_rgb, locations)
        return [e.tolist() for e in encodings] if encodings else []

    def compare_faces(
        self,
        query: list,
        stored: List[Dict],
    ) -> Optional[Tuple[str, float]]:
        """
        Compare a query embedding against a list of stored embeddings.
        Each item in `stored` must have keys: user_id, embedding.
        Returns (user_id, confidence) of best match within tolerance, else None.

        Confidence = 1 - distance (higher is better).
        """
        if not stored:
            return None

        query_np = np.array(query)
        best_user = None
        best_distance = float("inf")

        for record in stored:
            stored_np = np.array(record["embedding"])
            distance = float(np.linalg.norm(query_np - stored_np))
            if distance < best_distance:
                best_distance = distance
                best_user = record["user_id"]

        tol = MOCK_TOLERANCE if not self.available else TOLERANCE
        if best_distance <= tol:
            if self.available:
                confidence = 1.0 - best_distance
            else:
                confidence = max(0.0, 1.0 - (best_distance / tol))
            return (best_user, confidence)
        return None

    # ─────────────────────────────────────────────
    # Helpers
    # ─────────────────────────────────────────────

    def _decode_base64_image(self, image_b64: str) -> Optional[np.ndarray]:
        """Decode base64 string to numpy RGB image array."""
        try:
            # Strip data URL prefix if present
            if "," in image_b64:
                image_b64 = image_b64.split(",")[1]

            img_bytes = base64.b64decode(image_b64)
            img_array = np.frombuffer(img_bytes, dtype=np.uint8)

            if CV2_AVAILABLE:
                img_bgr = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
                if img_bgr is None:
                    return None
                # Downscale for faster processing if very large
                h, w = img_bgr.shape[:2]
                if w > 640:
                    scale = 640 / w
                    img_bgr = cv2.resize(img_bgr, (int(w * scale), int(h * scale)))
                img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
                return img_rgb
            else:
                # Fallback: return raw array (mock mode)
                return img_array
        except Exception as e:
            print(f"[FaceEngine] Image decode error: {e}")
            return None

    def _mock_embedding(self, image_rgb: np.ndarray) -> Optional[list]:
        """
        Lightweight deterministic embedding for demo mode.
        Downsamples the image into a 16x8 grayscale grid (128 values).
        """
        if image_rgb is None:
            return None
        try:
            if isinstance(image_rgb, np.ndarray) and image_rgb.ndim == 1:
                arr = image_rgb.astype(np.float32)
                if arr.size < 128:
                    arr = np.pad(arr, (0, 128 - arr.size), mode="constant")
                return (arr[:128] / 255.0).tolist()

            if not isinstance(image_rgb, np.ndarray) or image_rgb.ndim < 2:
                return [0.0] * 128

            if CV2_AVAILABLE and image_rgb.ndim == 3:
                small = cv2.resize(image_rgb, (16, 8), interpolation=cv2.INTER_AREA)
                gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
            else:
                # Fallback: approximate grayscale + simple downsample
                gray = image_rgb if image_rgb.ndim == 2 else image_rgb.mean(axis=2)
                h, w = gray.shape[:2]
                ys = np.linspace(0, max(h - 1, 0), 8).astype(int)
                xs = np.linspace(0, max(w - 1, 0), 16).astype(int)
                gray = gray[np.ix_(ys, xs)]

            vec = gray.astype(np.float32).flatten() / 255.0
            if vec.size < 128:
                vec = np.pad(vec, (0, 128 - vec.size), mode="constant")
            return vec[:128].tolist()
        except Exception:
            return [0.0] * 128

    def _generate_embedding(self, image_rgb: np.ndarray) -> Optional[list]:
        """Wrapper around generate_embedding for already-decoded images."""
        return self.generate_embedding(image_rgb)

    def _generate_embeddings(self, image_rgb: np.ndarray) -> List[list]:
        """Wrapper around generate_embeddings for already-decoded images."""
        return self.generate_embeddings(image_rgb)

    def _count_faces(self, image_rgb: np.ndarray) -> int:
        """Count detected face locations in image."""
        if not self.available:
            return 1  # mock
        locations = face_recognition.face_locations(image_rgb)
        return len(locations)

    def _motion_score(self, frames: List[np.ndarray]) -> float:
        if len(frames) < 2:
            return 0.0
        diffs = []
        prev_gray = None
        for frame in frames:
            if CV2_AVAILABLE and isinstance(frame, np.ndarray) and frame.ndim == 3:
                gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
            elif isinstance(frame, np.ndarray) and frame.ndim == 2:
                gray = frame
            else:
                continue
            if prev_gray is not None:
                diff = cv2.absdiff(prev_gray, gray) if CV2_AVAILABLE else np.abs(prev_gray.astype(np.float32) - gray.astype(np.float32))
                diffs.append(float(np.mean(diff)))
            prev_gray = gray
        return float(np.mean(diffs)) if diffs else 0.0

    def _eye_open_ratio(self, eye_points: List[tuple]) -> float:
        if len(eye_points) < 6:
            return 0.0
        points = np.array(eye_points, dtype=np.float32)
        horizontal = np.linalg.norm(points[0] - points[3])
        if horizontal == 0:
            return 0.0
        vertical = (
            np.linalg.norm(points[1] - points[5]) +
            np.linalg.norm(points[2] - points[4])
        ) / 2.0
        return float(vertical / horizontal)
