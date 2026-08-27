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

    private void Awake()
    {
        Instance = this;
#if UNITY_WEBGL && !UNITY_EDITOR
        // WebGL 셸의 3·2·1 카운트다운이 GO를 내보내기 전까지는 처음부터 정지한다.
        // 씬 기본값(10)으로 한 프레임이라도 먼저 달린 뒤 JS가 0을 보내게 두면,
        // Unity 로딩 직후 앞으로 움직였다가 3에서 멈추는 현상이 생긴다.
        _gameSpeed = 0;
        _scoreMultiplier = 1f;
#endif
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
