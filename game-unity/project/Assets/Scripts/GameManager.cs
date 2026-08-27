using System;
using UnityEngine;

public class GameManager : MonoBehaviour
{
    public static GameManager Instance;
    [SerializeField] private PlayerController _player;
    [SerializeField] private int _score = 0;
    [SerializeField] private float _scoreMultiplier = 1f;


    public event Action OnGameOver;
    public event Action<int> OnHealthChanged;
    public event Action<int, int, bool> OnCoinChanged;
    public event Action<int> OnGameSpeedChanged;

    public int GameSpeed
    {
        get
        {
            return _gameSpeed;
        }
        set
        {
            _gameSpeed = value;
            OnGameSpeedChanged?.Invoke(_gameSpeed);
            // 점수 배율은 "현재 속도의 함수"다. 예전에는 세터가 불릴 때마다
            // _scoreMultiplier *= 1.2f 를 해서, 부스 셸이 속도를 여러 번 보내면
            // (카운트다운 정지 → 재개처럼) 배율이 기하급수로 부풀었다.
            // 같은 값을 몇 번 넣어도 결과가 같도록 바꾼다.
            _scoreMultiplier = 1f + Mathf.Max(0, _gameSpeed) * _speedScoreBonus;
        }
    }
    [SerializeField] private int _gameSpeed;

    [Tooltip("게임 속도 1당 점수 배율 가산치")]
    [SerializeField] private float _speedScoreBonus = 0.02f;

    public int HighScore { get => _highScore; }
    private int _highScore;

    public int PlayerHealth { get => _playerHealth; }
    [SerializeField] private int _playerHealth = 3;

    public int CoinNumber { get => _coinNumber; }
    [SerializeField] private int _coinNumber;

    // ── 부스(브라우저) 로 점수/목숨/게임오버 전달 (WebGL 전용 jslib 브릿지) ──
#if UNITY_WEBGL && !UNITY_EDITOR
    [System.Runtime.InteropServices.DllImport("__Internal")] private static extern void BoothScore(int score, int coins);
    [System.Runtime.InteropServices.DllImport("__Internal")] private static extern void BoothHealth(int health);
    [System.Runtime.InteropServices.DllImport("__Internal")] private static extern void BoothHighScore(int hs);
    [System.Runtime.InteropServices.DllImport("__Internal")] private static extern void BoothGameOver();
#else
    private static void BoothScore(int score, int coins) { }
    private static void BoothHealth(int health) { }
    private static void BoothHighScore(int hs) { }
    private static void BoothGameOver() { }
#endif

    // ── 부스: 시작 직후 장애물 없는 구간 ──────────────────────────────────
    // 시간이 아니라 "이동 거리"로 센다. 부스 셸은 3·2·1 카운트다운 동안 속도를 0으로
    // 묶는데, 시간 기준이면 멈춰 있는 그 3초 동안 유예가 그냥 흘러가 버려서 실제로
    // 비는 구간이 로딩 시간에 따라 들쭉날쭉했다. 거리로 재면 멈춰 있는 동안은 줄지 않는다.
    [Header("부스 시작 유예")]
    [Tooltip("판 시작 후 장애물을 만들지 않을 이동 거리. 0이면 끔.")]
    [SerializeField] private float _obstacleGraceDistance = 60f;

    private float _graceDistanceLeft;

    /// <summary>지금 장애물 생성을 건너뛰어야 하는지.</summary>
    public bool ObstaclesSuppressed { get { return _graceDistanceLeft > 0f; } }

    private void Awake()
    {
        Instance = this;
        _graceDistanceLeft = _obstacleGraceDistance;
#if UNITY_WEBGL && !UNITY_EDITOR
        // WebGL 셸의 3·2·1 카운트다운이 GO를 내보내기 전까지는 처음부터 정지한다.
        // 씬 기본값(10)으로 한 프레임이라도 먼저 달린 뒤 JS가 0을 보내게 두면,
        // Unity 로딩 직후 앞으로 움직였다가 3에서 멈추는 현상이 생긴다.
        _gameSpeed = 0;
        _scoreMultiplier = 1f;
#endif
    }

    private void Update()
    {
        // 실제로 앞으로 나아간 만큼만 유예를 소모한다.
        if (_graceDistanceLeft > 0f) _graceDistanceLeft -= _gameSpeed * Time.deltaTime;
    }

    private void Start()
    {
        _player.OnPlayerGetHurt += Player_OnPlayerGetHurt;
        _player.OnCoinCollected += Player_OnCoinCollected;
        LoadHighScore();

        // 새 판 시작 시 부스 HUD 초기값 전송
        BoothScore(_score, _coinNumber);
        BoothHealth(_playerHealth);
        BoothHighScore(_highScore);
    }

    private void Player_OnCoinCollected()
    {
        _coinNumber++;
        _score = (int)((_coinNumber * _scoreMultiplier) * 10f);

        if (_score >= _highScore)
        {
            _highScore = _score;

            PlayerPrefs.SetInt("HighScore", _highScore);
            PlayerPrefs.Save();
            BoothHighScore(_highScore);
        }
        OnCoinChanged?.Invoke(_coinNumber, _score, _score >= _highScore);
        BoothScore(_score, _coinNumber);
    }

    private void Player_OnPlayerGetHurt()
    {
        _playerHealth--;
        OnHealthChanged?.Invoke(_playerHealth);
        BoothHealth(_playerHealth);

        if (_playerHealth <= 0)
        {
            Debug.Log("The Player is dead!");
            OnGameOver?.Invoke();
            BoothGameOver();
            return;
        }
    }

    private void OnDestroy()
    {
        _player.OnPlayerGetHurt -= Player_OnPlayerGetHurt;
        _player.OnCoinCollected -= Player_OnCoinCollected;
    }

    private void LoadHighScore()
    {
        _highScore = PlayerPrefs.GetInt("HighScore", 0);
    }
}
