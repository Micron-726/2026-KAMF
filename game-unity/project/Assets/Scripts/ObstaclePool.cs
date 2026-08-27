using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class ObstaclePool : MonoBehaviour
{
    public static ObstaclePool Instance;

    [SerializeField] private List<GameObject> _surmountableObstacles;
    [SerializeField] private List<GameObject> _nonSurmountableObstacles;

    [SerializeField] private GameObject _surmountableObstaclesParent;
    [SerializeField] private GameObject _nonSurmountableObstaclesParent;

    // ── 부스: "점프로 넘는 장애물" / "피해야 하는 장애물" 시각 구분 ──────────
    // 원래 장애물은 전부 같은 부류로 섞여 나왔고, 가장 낮은 것(1.57m)조차
    // 점프 정점(jumpForce 5 / mass 1 / g 9.81 → 1.27m)보다 높아서 사실상
    // 점프로 넘을 수 있는 장애물이 하나도 없었다. 그래서 플레이어 입장에선
    // 뛰어야 하는지 피해야 하는지 판단할 근거가 아예 없었다.
    //
    // 여기서 장애물을 두 부류로 갈라, 넘는 것은 확실히 낮고 초록, 피하는 것은
    // 확실히 높고 빨강으로 만든다. 씬을 건드리지 않고 실행 시점에 적용하므로
    // 값만 바꿔가며 바로 확인할 수 있다.
    [Header("부스 장애물 튜닝")]
    [Tooltip("끄면 원본 씬 그대로 둔다.")]
    [SerializeField] private bool _boothObstacleTuning = true;

    [Tooltip("점프로 넘는 장애물의 목표 높이(m). 점프 정점보다 충분히 낮아야 한다.")]
    [SerializeField] private float _lowObstacleTopY = 0.8f;

    [Tooltip("피해야 하는 장애물의 최소 높이(m). 이보다 낮으면 끌어올린다.")]
    [SerializeField] private float _tallObstacleMinTopY = 2.0f;

    [SerializeField] private Color _lowObstacleColor = new Color(0.29f, 0.85f, 0.44f);   // 초록 = 넘어라
    [SerializeField] private Color _tallObstacleColor = new Color(0.95f, 0.27f, 0.33f);  // 빨강 = 피해라

    // 이름 앞부분이 여기 있으면 "점프로 넘는" 장애물로 본다.
    // 씬에 장애물을 추가하면 이 목록도 같이 갱신해야 한다.
    private static readonly string[] LowObstacleNames =
    {
        "Crate", "Buildings_Block", "Tube", "Primitive_Cylander",
    };

    private MaterialPropertyBlock _mpb;

    private void Awake()
    {
        Instance = this;
        if (_boothObstacleTuning) ApplyObstacleTuning();
    }

    private void ApplyObstacleTuning()
    {
        _mpb = new MaterialPropertyBlock();
        foreach (var obstacle in _nonSurmountableObstacles)
        {
            if (obstacle == null) continue;
            bool low = IsLowObstacle(obstacle.name);
            ResizeToTop(obstacle, low);
            Tint(obstacle, low ? _lowObstacleColor : _tallObstacleColor);
        }
    }

    private static bool IsLowObstacle(string name)
    {
        foreach (var prefix in LowObstacleNames)
        {
            if (name.StartsWith(prefix)) return true;
        }
        return false;
    }

    /// <summary>
    /// 장애물의 윗면 높이를 목표치에 맞춰 Y 스케일을 조정한다.
    /// 풀에 있는 장애물은 비활성 상태라 Renderer/Collider.bounds(월드 AABB)를
    /// 읽을 수 없다. 메시의 로컬 bounds는 에셋 데이터라 활성 여부와 무관하므로
    /// 그쪽을 쓴다.
    /// </summary>
    private void ResizeToTop(GameObject obstacle, bool low)
    {
        if (!TryGetLocalBoundsY(obstacle, out float localMin, out float localMax)) return;

        float height = localMax - localMin;      // 스케일 1 기준 전체 높이
        if (height <= 0.0001f) return;

        var tr = obstacle.transform;
        float scaleY = tr.localScale.y;

        // 높이는 반드시 "바닥 기준"으로 잰다. 이 장애물들은 피벗이 제각각이라
        // (바닥에 있는 것도, 중심에 있는 것도 있다) 피벗 기준으로 재면 엉뚱해진다.
        float baseY = tr.localPosition.y + localMin * scaleY;
        float currentTop = baseY + height * scaleY;

        float targetTop = low ? _lowObstacleTopY : Mathf.Max(currentTop, _tallObstacleMinTopY);
        if (Mathf.Approximately(currentTop, targetTop)) return;

        float newScaleY = (targetTop - baseY) / height;
        if (newScaleY <= 0.001f) return;

        tr.localScale = new Vector3(tr.localScale.x, newScaleY, tr.localScale.z);
        // 스케일을 바꿔도 밑면은 원래 자리에 그대로 붙어 있게 위치를 보정한다.
        var pos = tr.localPosition;
        pos.y = baseY - localMin * newScaleY;
        tr.localPosition = pos;
    }

    /// <summary>자식 메시까지 포함한 로컬 Y 범위(루트 스케일은 빠진 값).</summary>
    private static bool TryGetLocalBoundsY(GameObject obstacle, out float minY, out float maxY)
    {
        minY = float.MaxValue;
        maxY = float.MinValue;
        bool found = false;

        var root = obstacle.transform;
        foreach (var mf in obstacle.GetComponentsInChildren<MeshFilter>(true))
        {
            if (mf.sharedMesh == null) continue;
            var b = mf.sharedMesh.bounds;
            // 자식 메시를 루트의 로컬 좌표계로 옮긴다(루트 스케일은 제외된다).
            Matrix4x4 toRoot = root.worldToLocalMatrix * mf.transform.localToWorldMatrix;
            for (int i = 0; i < 8; i++)
            {
                var corner = new Vector3(
                    (i & 1) == 0 ? b.min.x : b.max.x,
                    (i & 2) == 0 ? b.min.y : b.max.y,
                    (i & 4) == 0 ? b.min.z : b.max.z);
                float y = toRoot.MultiplyPoint3x4(corner).y;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
            }
        }
        return found;
    }

    private void Tint(GameObject obstacle, Color color)
    {
        foreach (var r in obstacle.GetComponentsInChildren<Renderer>(true))
        {
            if (r == null) continue;
            r.GetPropertyBlock(_mpb);
            _mpb.SetColor("_Color", color);       // 빌트인 셰이더
            _mpb.SetColor("_BaseColor", color);   // URP
            r.SetPropertyBlock(_mpb);
        }
    }

    public GameObject GetRandomObstacle(ObstacleType obstacleType)
    {
        GameObject randomObstacle = null;

        if (obstacleType == ObstacleType.Surmountable)
        {
            while (randomObstacle == null || randomObstacle.activeInHierarchy)
            {
                randomObstacle = _surmountableObstacles[Random.Range(0, _surmountableObstacles.Count)];
                if (randomObstacle != null && !randomObstacle.activeInHierarchy)
                {
                    _surmountableObstacles.Remove(randomObstacle);
                    return randomObstacle;
                }
            }
        }
        else if (obstacleType == ObstacleType.NonSurmountable)
        {
            while (randomObstacle == null || randomObstacle.activeInHierarchy)
            {
                randomObstacle = _nonSurmountableObstacles[Random.Range(0, _nonSurmountableObstacles.Count)];
                if (randomObstacle != null && !randomObstacle.activeInHierarchy)
                {
                    _nonSurmountableObstacles.Remove(randomObstacle);
                    return randomObstacle;
                }
            }
        }
        return null;
    }

    public void AddObstacleToList(GameObject obstacle, ObstacleType obstacleType)
    {
        if (obstacleType == ObstacleType.Surmountable)
        {
            _surmountableObstacles.Add(obstacle);
            obstacle.SetActive(false);
        }
        else
        {
            _nonSurmountableObstacles.Add(obstacle);
            obstacle.SetActive(false);
        }
    }
}
