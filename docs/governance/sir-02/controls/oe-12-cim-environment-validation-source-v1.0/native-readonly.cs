using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace Sir02CimEnvironmentValidationV1 {
  public sealed class ProcessSnapshot {
    public int Pid { get; set; }
    public string ImagePath { get; set; }
    public long CreationFileTimeUtc { get; set; }
    public uint SessionId { get; set; }
    public bool Exited { get; set; }
    public uint WaitResult { get; set; }
  }

  // Retains one read-only handle so all snapshots bind to the same process instance.
  public sealed class ReadOnlyProcessHandle {
    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    private const uint SYNCHRONIZE = 0x00100000;
    private const uint WAIT_OBJECT_0 = 0;
    private const uint WAIT_TIMEOUT = 258;
    private IntPtr handle;
    private readonly int pid;
    public bool CloseSucceeded { get; private set; }
    public int CloseError { get; private set; }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint desiredAccess, bool inheritHandle, uint processId);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "QueryFullProcessImageNameW")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder image, ref uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetProcessTimes(IntPtr process, out long created, out long exited, out long kernel, out long user);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ProcessIdToSessionId(uint processId, out uint sessionId);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr handle);

    private ReadOnlyProcessHandle(int processId, IntPtr ownedHandle) {
      pid = processId;
      handle = ownedHandle;
    }

    public static ReadOnlyProcessHandle Open(int processId) {
      if (processId <= 0) throw new ArgumentOutOfRangeException("processId");
      IntPtr ownedHandle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, false, (uint)processId);
      if (ownedHandle == IntPtr.Zero || ownedHandle == new IntPtr(-1))
        throw new Win32Exception(Marshal.GetLastWin32Error(), "OpenProcess read-only handle failed");
      return new ReadOnlyProcessHandle(processId, ownedHandle);
    }

    public ProcessSnapshot Read() {
      if (handle == IntPtr.Zero) throw new ObjectDisposedException("ReadOnlyProcessHandle");
      StringBuilder image = new StringBuilder(32768);
      uint size = (uint)image.Capacity;
      if (!QueryFullProcessImageName(handle, 0, image, ref size))
        throw new Win32Exception(Marshal.GetLastWin32Error(), "QueryFullProcessImageNameW failed");
      long created, exited, kernel, user;
      if (!GetProcessTimes(handle, out created, out exited, out kernel, out user))
        throw new Win32Exception(Marshal.GetLastWin32Error(), "GetProcessTimes failed");
      uint session;
      if (!ProcessIdToSessionId((uint)pid, out session))
        throw new Win32Exception(Marshal.GetLastWin32Error(), "ProcessIdToSessionId failed");
      uint wait = WaitForSingleObject(handle, 0);
      if (wait != WAIT_OBJECT_0 && wait != WAIT_TIMEOUT)
        throw new Win32Exception(Marshal.GetLastWin32Error(), "WaitForSingleObject read-only state failed");
      return new ProcessSnapshot {
        Pid = pid,
        ImagePath = image.ToString(),
        CreationFileTimeUtc = created,
        SessionId = session,
        Exited = wait == WAIT_OBJECT_0,
        WaitResult = wait
      };
    }

    public bool CloseOwnedHandle() {
      if (handle == IntPtr.Zero) return CloseSucceeded;
      bool closed = CloseHandle(handle);
      CloseError = closed ? 0 : Marshal.GetLastWin32Error();
      CloseSucceeded = closed;
      if (closed) handle = IntPtr.Zero;
      return closed;
    }
  }
}
