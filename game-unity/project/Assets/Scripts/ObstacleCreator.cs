using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public enum ObstacleType
{
    Surmountable,
    NonSurmountable
}

public class ObstacleCreator : MonoBehaviour
{
    [SerializeField] private ObstaclePool _obstaclePool;
    [SerializeField] private ObstacleType _obstacleType;

    private GameObject _randomObstacle;

    private void OnEnable()
    {
        // 시작 직후 유예 구간에는 장애물을 만들지 않는다.
        //
        // GameManager 가 아직 없으면(스크립트 실행 순서는 보장되지 않아서 이 OnEnable 이
        // GameManager.Awake 보다 먼저 불릴 수 있다) "유예 중"으로 본다.
        // 예전에는 반대로 없으면 그냥 만들었는데, 그러면 어떤 스폰 지점은 유예를 지키고
        // 어떤 지점은 무시해서 장애물이 나왔다 안 나왔다 했다.
        var gameManager = GameManager.Instance;
        if (gameManager == null || gameManager.ObstaclesSuppressed) return;

        if (_randomObstacle == null)
        {
            _randomObstacle = _obstaclePool.GetRandomObstacle(_obstacleType);
            if (_randomObstacle == null) return;
            _randomObstacle.transform.SetParent(transform, false);
            _randomObstacle.SetActive(true);
        }
    }

    private void OnDisable()
    {
        // teardown/씬 리로드 시 ObstaclePool이 먼저 사라질 수 있어 null 가드.
        // 유예 구간이라 아무것도 안 만들었으면 돌려줄 것도 없다.
        if (_randomObstacle != null && ObstaclePool.Instance != null)
            ObstaclePool.Instance.AddObstacleToList(_randomObstacle, _obstacleType);
        _randomObstacle = null;
    }
}
