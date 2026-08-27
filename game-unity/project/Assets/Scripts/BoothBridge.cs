using UnityEngine;
using UnityEngine.SceneManagement;

/// <summary>
/// 부스 셸(브라우저 JS)에서 Unity WebGL을 조작하기 위한 다리.
/// JS 쪽에서:  unityInstance.SendMessage("BoothBridge", "MoveLeft");
///            unityInstance.SendMessage("BoothBridge", "MoveRight");
///            unityInstance.SendMessage("BoothBridge", "Jump");
///            unityInstance.SendMessage("BoothBridge", "SetSpeed", 20);
///            unityInstance.SendMessage("BoothBridge", "Restart");
///
/// 씬을 수정하지 않아도 되도록, 실행 시 스스로 "BoothBridge"라는 GameObject를 만든다.
/// SendMessage는 이 GameObject 이름으로 메서드를 호출한다.
/// </summary>
public class BoothBridge : MonoBehaviour
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void Bootstrap()
    {
        if (FindObjectOfType<BoothBridge>() != null) return;
        var go = new GameObject("BoothBridge");
        go.AddComponent<BoothBridge>();
        DontDestroyOnLoad(go);
    }

    private void Awake()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        // 기본값(true)이면 Unity가 페이지의 모든 키 입력을 가로채서, 부스 셸의
        // C(재보정)/Esc(메뉴) 단축키가 안 먹는다. 부스는 조작을 SendMessage로
        // 하므로 Unity가 키보드를 잡을 필요가 없다 → 페이지에 돌려준다.
        WebGLInput.captureAllKeyboardInput = false;
#endif
    }

    // 새 판 시작(플레이어 교체 / 게임오버 후). UIManager의 재시작과 동일하게
    // timeScale을 되돌리고 게임 씬(빌드 인덱스 0)을 다시 로드한다.
    public void Restart()
    {
        Time.timeScale = 1f;
        SceneManager.LoadScene(0);
    }

    // 플레이어는 판(run)마다 생성/파괴될 수 있으므로 호출 시점에 찾는다.
    private PlayerController FindPlayer()
    {
        return FindObjectOfType<PlayerController>();
    }

    public void MoveLeft()
    {
        var p = FindPlayer();
        if (p != null) p.MoveLeft();
    }

    public void MoveRight()
    {
        var p = FindPlayer();
        if (p != null) p.MoveRight();
    }

    public void Jump()
    {
        var p = FindPlayer();
        if (p != null) p.Jump();
    }

    // 부스 설정 슬라이더 → 게임 속도. GameManager.GameSpeed(int) 프로퍼티로 전파된다.
    public void SetSpeed(int gameSpeed)
    {
        if (GameManager.Instance != null)
        {
            GameManager.Instance.GameSpeed = gameSpeed;
        }
    }

    // 부스 설정 슬라이더 → 좌우 이동 속도(PlayerController._laneChangeSpeed).
    public void SetLaneSpeed(float laneSpeed)
    {
        var p = FindPlayer();
        if (p != null) p.SetLaneChangeSpeed(laneSpeed);
    }
}
