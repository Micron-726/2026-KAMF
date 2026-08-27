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
            _scoreMultiplier *= 1.2f;
            Debug.Log("The game is speed up!");
        }
    }
    [SerializeField] private int _gameSpeed;

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
