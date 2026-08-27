using System.Collections;
using UnityEngine;

/// <summary>
/// 장애물에 부딪히면(PlayerController.OnPlayerGetHurt) 넙죽이를 무적이 끝날 때까지
/// 빨갛게 깜빡인다. 끝이 가까울수록 빨리 깜빡여서 "곧 무적이 끝난다"를 알린다.
/// 넙죽이(메시가 있는 오브젝트 또는 그 부모)에 Add Component 하면 된다.
/// 렌더러는 자동으로 자식에서 찾는다.
/// </summary>
public class NubzukiFlash : MonoBehaviour
{
    [SerializeField] private Color _flashColor = Color.red;

    [Tooltip("켜면 PlayerController 의 무적 시간 내내 깜빡인다. 끄면 아래 고정 길이를 쓴다.")]
    [SerializeField] private bool _matchInvincibleDuration = true;

    [Tooltip("_matchInvincibleDuration 이 꺼져 있을 때 쓰는 깜빡임 총 길이(초).")]
    [SerializeField] private float _flashDuration = 0.4f;

    [Tooltip("깜빡임 시작 간격(초) — 느리게.")]
    [SerializeField] private float _blinkIntervalStart = 0.14f;

    [Tooltip("깜빡임 종료 간격(초) — 빠르게.")]
    [SerializeField] private float _blinkIntervalEnd = 0.045f;

    private PlayerController _player;
    private Renderer[] _renderers;
    private MaterialPropertyBlock _mpb;

    private void Awake()
    {
        _mpb = new MaterialPropertyBlock();
        _renderers = GetComponentsInChildren<Renderer>();
    }

    private void Start()
    {
        _player = GetComponentInParent<PlayerController>();
        if (_player != null) _player.OnPlayerGetHurt += Flash;
    }

    private void OnDestroy()
    {
        if (_player != null) _player.OnPlayerGetHurt -= Flash;
    }

    private void Flash()
    {
        StopAllCoroutines();
        StartCoroutine(FlashRoutine());
    }

    private IEnumerator FlashRoutine()
    {
        float total = _flashDuration;
        if (_matchInvincibleDuration && _player != null) total = _player.InvincibleDuration;
        if (total <= 0f) { ClearColor(); yield break; }

        float elapsed = 0f;
        bool on = false;
        while (elapsed < total)
        {
            on = !on;
            if (on) SetColor(_flashColor); else ClearColor();

            // 남은 시간이 줄수록 간격을 좁혀 점점 빨리 깜빡이게 한다.
            float remaining01 = 1f - (elapsed / total);          // 1 → 0
            float interval = Mathf.Lerp(_blinkIntervalEnd, _blinkIntervalStart, remaining01);
            interval = Mathf.Max(interval, 0.02f);

            yield return new WaitForSeconds(interval);
            elapsed += interval;
        }
        ClearColor();
    }

    private void SetColor(Color c)
    {
        foreach (var r in _renderers)
        {
            if (r == null) continue;
            r.GetPropertyBlock(_mpb);
            _mpb.SetColor("_Color", c);      // 빌트인 셰이더
            _mpb.SetColor("_BaseColor", c);  // URP
            r.SetPropertyBlock(_mpb);
        }
    }

    private void ClearColor()
    {
        foreach (var r in _renderers)
        {
            if (r != null) r.SetPropertyBlock(null);   // 원래 색 복귀
        }
    }
}
