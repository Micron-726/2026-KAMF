using System.Collections;
using UnityEngine;

/// <summary>
/// 장애물에 부딪히면(PlayerController.OnPlayerGetHurt) 넙죽이를 잠깐 빨갛게 깜빡인다.
/// 넙죽이(메시가 있는 오브젝트 또는 그 부모)에 Add Component 하면 된다.
/// 렌더러는 자동으로 자식에서 찾는다.
/// </summary>
public class NubzukiFlash : MonoBehaviour
{
    [SerializeField] private Color _flashColor = Color.red;
    [SerializeField] private float _flashDuration = 0.4f;
    [SerializeField] private int _blinkCount = 3;   // 깜빡임 횟수

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
        float interval = _flashDuration / Mathf.Max(1, _blinkCount * 2);
        for (int i = 0; i < _blinkCount; i++)
        {
            SetColor(_flashColor);
            yield return new WaitForSeconds(interval);
            ClearColor();
            yield return new WaitForSeconds(interval);
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
