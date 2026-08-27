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
        // 시작 직후 유예 구간에는 장애물을 만들지 않는다 — 이 스폰 지점은 빈 채로
        // 지나가서, 플레이어가 자세를 잡을 시간이 생긴다.
        if (GameManager.Instance != null && GameManager.Instance.ObstaclesSuppressed) return;

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
