using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using TMPro;
using System;
using UnityEngine.SceneManagement;

public class UIManager : MonoBehaviour
{
    [SerializeField] private PlayerController _player;
    [SerializeField] private TextMeshProUGUI _coinText;
    [SerializeField] private TextMeshProUGUI _scoreText;
    [SerializeField] private TextMeshProUGUI _highScoreText;
    [SerializeField] private TextMeshProUGUI _healthText;
    [SerializeField] private GameObject _tryAgainUI;

    private void Start()
    {
        GameManager.Instance.OnCoinChanged += GameManager_OnCoinChanged;
        GameManager.Instance.OnHealthChanged += GameManager_OnHealthChanged;
        GameManager.Instance.OnGameOver += GameManager_OnGameOver;

        _highScoreText.text = GameManager.Instance.HighScore.ToString();

#if UNITY_WEBGL && !UNITY_EDITOR
        // 부스(WebGL)에서는 점수/목숨/게임오버 UI를 booth 셸이 그리므로,
        // 게임 내장 HUD 캔버스를 통째로 숨긴다.
        if (_scoreText != null && _scoreText.canvas != null)
        {
            _scoreText.canvas.gameObject.SetActive(false);
        }
#endif
    }

    private void GameManager_OnGameOver()
    {
        _tryAgainUI.SetActive(true);
    }

    private void GameManager_OnHealthChanged(int health)
    {
        _healthText.text = health.ToString();
    }

    private void GameManager_OnCoinChanged(int coin, int score, bool isItHighScore)
    {
        _coinText.text = coin.ToString();
        _scoreText.text = score.ToString();

        if (isItHighScore)
        {
            _highScoreText.text = GameManager.Instance.HighScore.ToString();
            _scoreText.color = Color.red;
        }
    }

    private void OnDestroy()
    {
        GameManager.Instance.OnCoinChanged -= GameManager_OnCoinChanged;
        GameManager.Instance.OnHealthChanged -= GameManager_OnHealthChanged;
    }

    public void TryAgain()
    {
        Time.timeScale = 1;
        _tryAgainUI.SetActive(false);
        SceneManager.LoadScene(0);
    }
}
