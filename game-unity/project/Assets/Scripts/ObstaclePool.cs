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

    // ── 부스: 넘을 수 있는 장애물 / 피해야 하는 장애물 색 구분 ───────────────
    // 원래는 40개 장애물이 전부 한 부류로 섞여 나와서, 플레이어가 뛰어야 할지
    // 피해야 할지 판단할 근거가 화면에 전혀 없었다.
    //
    // 여기서 두 가지를 한다.
    //   1) _jumpableObstacleNames 에 든 장애물은 "확실히 넘어지는" 높이로 낮춘다.
    //   2) 색은 이름이 아니라 **조정이 끝난 뒤 실제로 잰 높이**로 정한다.
    //      기준선(PlayerController.JumpClearanceHeight)도 실제 질량·중력·점프력에서
    //      계산한 값이라, 초록으로 칠해진 장애물은 실제로 넘어간다는 게 보장된다.
    //      크기 조정을 꺼도 색은 여전히 사실을 말한다.
    [Header("부스 장애물 튜닝")]
    [Tooltip("끄면 원본 씬 그대로 둔다.")]
    [SerializeField] private bool _boothObstacleTuning = true;

    [Tooltip("끄면 높이는 그대로 두고 색만 칠한다.")]
    [SerializeField] private bool _resizeObstacles = true;

    [Tooltip("점프 계산에 더할 여유(m). 실제 플레이가 계산보다 관대하면 여기를 올린다.")]
    [SerializeField] private float _extraClearance = 0.15f;

    [Tooltip("초록 장애물을 기준선보다 얼마나 더 낮출지(m). 타이밍 여유가 된다.")]
    [SerializeField] private float _lowObstacleMargin = 0.35f;

    [Tooltip("빨강 장애물의 최소 높이(m). 이보다 낮으면 끌어올려 헷갈리지 않게 한다.")]
    [SerializeField] private float _tallObstacleMinTopY = 2.0f;

    [Tooltip("PlayerController 를 못 찾았을 때 쓸 기준 높이(m).")]
    [SerializeField] private float _fallbackClearance = 1.3f;

    [Tooltip("이 이름으로 시작하는 장애물을 '점프로 넘는' 쪽으로 만든다.")]
    [SerializeField]
    private string[] _jumpableObstacleNames =
    {
        "Primitive_Cylander",   // 뭉툭한 원기둥 — 나무 밑동처럼 보이는 것
        "Tube",
        "Small Car",
        "Crate",
    };

    [SerializeField] private Color _jumpableColor = new Color(0.29f, 0.85f, 0.44f);   // 초록 = 넘어라
    [SerializeField] private Color _blockingColor = new Color(0.95f, 0.27f, 0.33f);   // 빨강 = 피해라

    private MaterialPropertyBlock _mpb;

    private void Awake()
    {
        Instance = this;
        if (_boothObstacleTuning) ApplyObstacleTuning();
    }

    private void ApplyObstacleTuning()
    {
        _mpb = new MaterialPropertyBlock();

        float clearance = ResolveJumpClearance();
        float lowTarget = Mathf.Max(0.2f, clearance - _lowObstacleMargin);

        foreach (var obstacle in _nonSurmountableObstacles)
        {
            if (obstacle == null) continue;

            if (_resizeObstacles)
            {
                float targetTop = MatchesJumpableName(obstacle.name)
                    ? lowTarget
                    : Mathf.Max(MeasureTopY(obstacle), _tallObstacleMinTopY);
                ResizeToTop(obstacle, targetTop);
            }

            // 색은 최종 실측 높이로 정한다 — 크기 조정이 꺼져 있거나 어떤 이유로
            // 조정이 안 먹었더라도 색이 거짓말하지 않게.
            bool jumpable = MeasureTopY(obstacle) <= clearance;
            Tint(obstacle, jumpable ? _jumpableColor : _blockingColor);
        }

        // 계단은 애초에 데미지가 없고 뛰어 올라가는 지형이라 넘어가는 쪽으로 칠한다.
        foreach (var stairs in _surmountableObstacles)
        {
            if (stairs != null) Tint(stairs, _jumpableColor);
        }
    }

    /// <summary>점프로 넘을 수 있는 윗면 높이의 기준선(m).</summary>
    private float ResolveJumpClearance()
    {
        var player = FindObjectOfType<PlayerController>();
        float baseline = player != null ? player.JumpClearanceHeight : _fallbackClearance;
        return baseline + _extraClearance;
    }

    private bool MatchesJumpableName(string name)
    {
        if (_jumpableObstacleNames == null) return false;
        foreach (var prefix in _jumpableObstacleNames)
        {
            if (!string.IsNullOrEmpty(prefix) && name.StartsWith(prefix)) return true;
        }
        return false;
    }

    /// <summary>장애물 윗면의 높이(m). 바닥 기준.</summary>
    private static float MeasureTopY(GameObject obstacle)
    {
        if (!TryGetLocalBoundsY(obstacle, out float localMin, out float localMax)) return 0f;
        var tr = obstacle.transform;
        return tr.localPosition.y + localMax * tr.localScale.y;
    }

    /// <summary>
    /// 윗면 높이를 목표치에 맞춰 Y 스케일을 조정한다.
    /// 높이는 반드시 바닥 기준으로 잰다 — 이 장애물들은 피벗이 0~1.25로 제각각이라
    /// 피벗 기준으로 재면 엉뚱한 값이 나온다.
    /// </summary>
    private void ResizeToTop(GameObject obstacle, float targetTop)
    {
        if (!TryGetLocalBoundsY(obstacle, out float localMin, out float localMax)) return;

        float height = localMax - localMin;      // 스케일 1 기준 전체 높이
        if (height <= 0.0001f) return;

        var tr = obstacle.transform;
        float scaleY = tr.localScale.y;
        float baseY = tr.localPosition.y + localMin * scaleY;   // 밑면(보통 바닥)
        float currentTop = baseY + height * scaleY;

        if (Mathf.Approximately(currentTop, targetTop)) return;

        float newScaleY = (targetTop - baseY) / height;
        if (newScaleY <= 0.001f) return;

        tr.localScale = new Vector3(tr.localScale.x, newScaleY, tr.localScale.z);
        // 스케일을 바꿔도 밑면은 원래 자리에 그대로 붙어 있게 위치를 보정한다.
        var pos = tr.localPosition;
        pos.y = baseY - localMin * newScaleY;
        tr.localPosition = pos;
    }

    /// <summary>
    /// 자식 메시까지 포함한 로컬 Y 범위(루트 스케일은 빠진 값).
    /// 풀에 든 장애물은 비활성이라 Renderer/Collider.bounds 를 못 읽는다.
    /// 메시의 로컬 bounds 는 에셋 데이터라 활성 여부와 무관하다.
    /// </summary>
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
