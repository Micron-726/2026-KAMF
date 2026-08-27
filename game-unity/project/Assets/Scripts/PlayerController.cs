using System;
using System.Collections;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UIElements;

public enum PlayerState
{
    Running,
    Jumping
}

public enum PlayerSide
{
    Left,
    Center,
    Right
}

public class PlayerController : MonoBehaviour
{
    public event Action OnPlayerGetHurt;
    public event Action OnCoinCollected;

    [SerializeField] private float _playerSideLocation;
    [SerializeField] private float _sideSlideForce;
    [SerializeField] private float _laneChangeSpeed = 16f;   // 레인 이동 부드럽기(단위/초). 크면 빠르게, 작으면 천천히
    [SerializeField] private float _jumpForce;
    [SerializeField] private float _climbForce;
    [SerializeField] private float _flashingAnimationDuration;
    [SerializeField] private float _dyingAnimationDuration;
    [SerializeField] private float _slideDuration;

    /// <summary>부딪힌 뒤 무적으로 있는 시간(초). NubzukiFlash 가 깜빡임 길이를 여기 맞춘다.</summary>
    public float InvincibleDuration { get { return _flashingAnimationDuration; } }

    /// <summary>
    /// 점프해서 넘어갈 수 있는 장애물 윗면의 최대 높이(m).
    /// 실제 질량·중력·콜라이더에서 계산하므로 Inspector 값을 바꾸면 같이 따라온다.
    /// ObstaclePool 이 장애물을 초록/빨강으로 나누는 기준으로 쓴다.
    /// Start() 보다 먼저 불릴 수 있어 캐시 대신 GetComponent 를 그때그때 쓴다.
    /// </summary>
    public float JumpClearanceHeight
    {
        get
        {
            var rb = GetComponent<Rigidbody>();
            var cc = GetComponent<CapsuleCollider>();
            float mass = rb != null ? Mathf.Max(rb.mass, 0.0001f) : 1f;
            float g = Mathf.Max(Mathf.Abs(Physics.gravity.y), 0.0001f);

            float v = _jumpForce / mass;        // ForceMode.Impulse → 속도 변화량
            float apex = (v * v) / (2f * g);    // 정점까지 올라가는 높이

            // 캡슐 밑면이 발밑에서 떠 있는 만큼은 그대로 여유가 된다.
            float feet = cc != null ? cc.center.y - cc.height * 0.5f : 0f;
            return apex + feet;
        }
    }

    private PlayerSide _playerSide;
    private PlayerState _playerState;
    private bool _canVulnerable = true;
    private bool _isSliding = false;
    public bool _isClimbing = false;
    private Rigidbody _rigidbody;
    private Animator _animator;

    private void Start()
    {
        _rigidbody = GetComponent<Rigidbody>();
        _animator = GetComponent<Animator>();

        _playerSide = PlayerSide.Center;
        _playerState = PlayerState.Running;

        GameManager.Instance.OnGameOver += GameManager_OnGameOver;
    }

    private void GameManager_OnGameOver()
    {
        _animator.SetBool("IsDead", true);

        // call a function to stop the the game after a given duration...
        Invoke(nameof(StopTheGame), _dyingAnimationDuration);
    }

    private void Update()
    {
        HandlePlayerMovement();
    }

    private void FixedUpdate()
    {
        ResetPosition();

        if (_isClimbing)
        {
            _rigidbody.AddForce(Vector3.up * _climbForce * GameManager.Instance.GameSpeed / 10, ForceMode.Force);
        }
    }

    private void HandlePlayerMovement()
    {
        if (Input.GetKeyDown(KeyCode.A) || Input.GetKeyDown(KeyCode.LeftArrow))
        {
            MoveLeft();
        }
        else if (Input.GetKeyDown(KeyCode.D) || Input.GetKeyDown(KeyCode.RightArrow))
        {
            MoveRight();
        }
        else if (Input.GetKeyDown(KeyCode.S) || Input.GetKeyDown(KeyCode.DownArrow))
        {
            Roll();
        }
        else if (Input.GetKeyDown(KeyCode.W) || Input.GetKeyDown(KeyCode.UpArrow) || Input.GetKeyDown(KeyCode.Space))
        {
            Jump();
        }
    }

    // ── Public actions: keyboard(위) AND booth 셸이 BoothBridge.SendMessage로 호출 ──
    // 각 메서드가 자체 가드(_isSliding / _playerState)를 가져 외부 호출도 안전하다.
    public void MoveLeft()
    {
        if (_isSliding || _playerState != PlayerState.Running) return;
        if (_playerSide == PlayerSide.Center)
        {
            _playerSide = PlayerSide.Left;
        }
        else if (_playerSide == PlayerSide.Right)
        {
            _playerSide = PlayerSide.Center;
        }
        else if (_playerSide == PlayerSide.Left)
        {
            return;
        }
        // 입력 락 없음 — 연속 이동 즉시 반응 (부드러운 MoveTowards가 이동 처리)
    }

    public void MoveRight()
    {
        if (_isSliding || _playerState != PlayerState.Running) return;
        if (_playerSide == PlayerSide.Center)
        {
            _playerSide = PlayerSide.Right;
        }
        else if (_playerSide == PlayerSide.Left)
        {
            _playerSide = PlayerSide.Center;
        }
        else if (_playerSide == PlayerSide.Right)
        {
            return;
        }
        // 입력 락 없음 — 연속 이동 즉시 반응 (부드러운 MoveTowards가 이동 처리)
    }

    public void Roll()
    {
        if (_isSliding || _playerState != PlayerState.Running) return;
        GetComponent<CapsuleCollider>().height = 1.04149f;
        GetComponent<CapsuleCollider>().center = new Vector3(GetComponent<CapsuleCollider>().center.x, 0.5455304f, GetComponent<CapsuleCollider>().center.z);
        _animator.SetTrigger("Rolled");
    }

    public void Jump()
    {
        if (_isSliding) return;
        if (_playerState == PlayerState.Jumping) return;
        // The Player is jumping...
        _playerState = PlayerState.Jumping;
        _animator.SetTrigger("Jumped");
        _rigidbody.AddForce(Vector3.up * _jumpForce, ForceMode.Impulse);
    }

    private void StopTheGame()
    {
        Debug.Log("Game Over");
        Time.timeScale = 0;
    }

    private IEnumerator ResetMovement()
    {
        yield return new WaitForSeconds(_slideDuration); // wait some secs for make sure sliding end....

        _isSliding = false;
    }

    private void ResetPosition()
    {
        // 목표 레인 x로 매 프레임 부드럽게 미끄러진다(뚝 끊기는 스냅 대신).
        float targetX = 0f;
        if (_playerSide == PlayerSide.Left) targetX = -_playerSideLocation;
        else if (_playerSide == PlayerSide.Right) targetX = _playerSideLocation;

        Vector3 pos = transform.position;
        pos.x = Mathf.MoveTowards(pos.x, targetX, _laneChangeSpeed * Time.deltaTime);
        transform.position = pos;
    }

    // 부스 설정에서 좌우 이동 속도 조절 (BoothBridge.SetLaneSpeed 경유)
    public void SetLaneChangeSpeed(float s)
    {
        _laneChangeSpeed = s;
    }

    private void OnCollisionEnter(Collision collision)
    {
        if (collision.gameObject.CompareTag("Road"))
        {
            _playerState = PlayerState.Running;
        }

        if (collision.gameObject.CompareTag("Stairs"))
        {
            _isClimbing = true;
        }
    }
    void OnCollisionExit(Collision collision)
    {
        if (collision.gameObject.CompareTag("Stairs"))
        {
            _isClimbing = false;
        }
    }

    private void OnTriggerEnter(Collider other)
    {
        if (other.gameObject.CompareTag("Obstacle") && _canVulnerable)
        {
            OnPlayerGetHurt?.Invoke();

            // play animation...
            _animator.SetBool("IsFlashing", true);
            _canVulnerable = false;

            // call a function to stop the animation after a given duration...
            Invoke(nameof(StopFlashingAnimation), _flashingAnimationDuration);
        }
    }

    // function to stop the animation after a given duration...
    private void StopFlashingAnimation()
    {
        _animator.SetBool("IsFlashing", false);
        _canVulnerable = true;
    }

    private void OnTriggerExit(Collider other)
    {
        if (other.gameObject.CompareTag("Coin"))
        {
            OnCoinCollected?.Invoke();
            other.gameObject.transform.GetComponentInParent<CoinController>().ResetCoin();
        }
    }

    private void OnDisable()
    {
        // teardown/씬 리로드 시 GameManager가 먼저 사라질 수 있어 null 가드.
        if (GameManager.Instance != null)
            GameManager.Instance.OnGameOver -= GameManager_OnGameOver;
    }
    public void AnimationCompleted()
    {
        GetComponent<CapsuleCollider>().height = 1.602617f;
        GetComponent<CapsuleCollider>().center = new Vector3(GetComponent<CapsuleCollider>().center.x, 0.8260937f, GetComponent<CapsuleCollider>().center.z);
    }
}

