using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

namespace Sir02JobMembershipDiagnostic {
  public sealed class NativeStep {
    public string Api;
    public bool Success;
    public int ErrorCode;
    public int Pid;
    public string Detail;
  }

  public sealed class MemberObservation {
    public int Pid;
    public bool Opened;
    public int OpenError;
    public long CreationFileTimeUtc;
    public string ImagePath;
    public bool ImageQuerySucceeded;
    public int ImageError;
    public bool MembershipQuerySucceeded;
    public bool InJob;
    public int MembershipError;
  }

  public sealed class NativeSession : IDisposable {
    const int JobObjectBasicProcessIdList = 3;
    const int JobObjectExtendedLimitInformation = 9;
    const int JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    const int JOB_OBJECT_LIMIT_BREAKAWAY_OK = 0x00000800;
    const int JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK = 0x00001000;
    const int CREATE_SUSPENDED = 0x00000004;
    const int CREATE_NO_WINDOW = 0x08000000;
    const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    const uint SYNCHRONIZE = 0x00100000;
    const uint WAIT_OBJECT_0 = 0;
    const uint WAIT_TIMEOUT = 0x102;
    const uint WAIT_FAILED = 0xFFFFFFFF;

    [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
      public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
      public int LimitFlags;
      public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
      public int ActiveProcessLimit;
      public IntPtr Affinity;
      public int PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS {
      public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
      public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }
    [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
      public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
      public IO_COUNTERS IoInfo;
      public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPINFO {
      public int cb;
      public IntPtr lpReserved, lpDesktop, lpTitle;
      public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
      public short wShowWindow, cbReserved2;
      public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }
    [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION {
      public IntPtr hProcess, hThread;
      public int dwProcessId, dwThreadId;
    }

    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true, EntryPoint="CreateJobObjectW")]
    static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION data, int length);
    [DllImport("kernel32.dll", SetLastError=true, EntryPoint="QueryInformationJobObject")]
    static extern bool QueryJobLimit(IntPtr job, int infoClass, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION data, int length, out int returned);
    [DllImport("kernel32.dll", SetLastError=true, EntryPoint="QueryInformationJobObject")]
    static extern bool QueryJobPids(IntPtr job, int infoClass, IntPtr data, int length, out int returned);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true, EntryPoint="CreateProcessW")]
    static extern bool CreateProcess(string application, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes,
      [MarshalAs(UnmanagedType.Bool)] bool inherit, int creationFlags, IntPtr environment, string currentDirectory,
      ref STARTUPINFO startup, out PROCESS_INFORMATION process);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool IsProcessInJob(IntPtr process, IntPtr job, [MarshalAs(UnmanagedType.Bool)] out bool result);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern IntPtr OpenProcess(uint access, [MarshalAs(UnmanagedType.Bool)] bool inherit, uint pid);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true, EntryPoint="QueryFullProcessImageNameW")]
    static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder path, ref int size);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool TerminateProcess(IntPtr process, uint exitCode);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool CloseHandle(IntPtr handle);

    IntPtr job = IntPtr.Zero;
    IntPtr parent = IntPtr.Zero;
    IntPtr parentThread = IntPtr.Zero;
    bool parentSuspended;
    bool verifiedNoKillOnClose;
    public int ParentPid { get; private set; }
    public long ParentCreationFileTimeUtc { get; private set; }
    public bool ParentExplicitlyAssigned { get; private set; }
    public int EffectiveJobFlags { get; private set; }
    public bool HandleCleanupSucceeded { get; private set; }
    public readonly List<NativeStep> Steps = new List<NativeStep>();

    static bool Valid(IntPtr handle) { return handle != IntPtr.Zero && handle != new IntPtr(-1); }
    void Record(string api, bool success, int error, int pid, string detail) {
      Steps.Add(new NativeStep { Api=api, Success=success, ErrorCode=error, Pid=pid, Detail=detail });
    }
    void Require(string api, bool success, int pid, string detail) {
      int error = success ? 0 : Marshal.GetLastWin32Error();
      Record(api, success, error, pid, detail);
      if (!success) throw new InvalidOperationException(api + " failed; Win32=" + error);
    }
    static long Creation(IntPtr handle) {
      long creation, exit, kernel, user;
      return GetProcessTimes(handle, out creation, out exit, out kernel, out user) ? creation : 0;
    }

    public NativeSession() {
      HandleCleanupSucceeded = true;
      try {
        job = CreateJobObject(IntPtr.Zero, null);
        Require("CreateJobObjectW", Valid(job), 0, "anonymous; non-inheritable handle");
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        limits.BasicLimitInformation.LimitFlags = 0;
        int size = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
        Require("SetInformationJobObject", SetInformationJobObject(job, JobObjectExtendedLimitInformation, ref limits, size), 0,
          "zero limits; no kill-on-close and no breakaway");
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION observed = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        int returned;
        Require("QueryInformationJobObject(JobObjectExtendedLimitInformation)",
          QueryJobLimit(job, JobObjectExtendedLimitInformation, ref observed, size, out returned), 0,
          "effective limit read-back");
        EffectiveJobFlags = observed.BasicLimitInformation.LimitFlags;
        verifiedNoKillOnClose = EffectiveJobFlags == 0;
        Record("VerifyNonDestructiveJobLimits", verifiedNoKillOnClose, 0, 0, "flags=" + EffectiveJobFlags);
        if (!verifiedNoKillOnClose) throw new InvalidOperationException("Non-destructive Job limit verification failed");
      } catch { Dispose(); throw; }
    }

    public void StartSyntheticParent(string executable, string quotedCommandLine, string workingDirectory) {
      if (!verifiedNoKillOnClose || !System.IO.File.Exists(executable) || String.IsNullOrWhiteSpace(quotedCommandLine))
        throw new InvalidOperationException("Pre-launch executable, command line, or Job limit gate failed");
      STARTUPINFO startup = new STARTUPINFO();
      startup.cb = Marshal.SizeOf(typeof(STARTUPINFO));
      PROCESS_INFORMATION pi = new PROCESS_INFORMATION();
      Require("CreateProcessW(CREATE_SUSPENDED)",
        CreateProcess(executable, new StringBuilder(quotedCommandLine), IntPtr.Zero, IntPtr.Zero, false,
          CREATE_SUSPENDED | CREATE_NO_WINDOW, IntPtr.Zero, workingDirectory, ref startup, out pi), 0,
        "synthetic Node parent; no inherited handles");
      parent = pi.hProcess; parentThread = pi.hThread; parentSuspended = true; ParentPid = pi.dwProcessId;
      ParentCreationFileTimeUtc = Creation(parent);
      Record("GetProcessTimes(parent)", ParentCreationFileTimeUtc != 0, ParentCreationFileTimeUtc == 0 ? Marshal.GetLastWin32Error() : 0,
        ParentPid, "creationFileTimeUtc=" + ParentCreationFileTimeUtc);
      try {
        if (ParentCreationFileTimeUtc == 0) throw new InvalidOperationException("Parent creation time unavailable");
        Require("AssignProcessToJobObject", AssignProcessToJobObject(job, parent), ParentPid, "only explicit assignment");
        bool inJob;
        Require("IsProcessInJob(parent)", IsProcessInJob(parent, job, out inJob), ParentPid, "pre-resume membership query");
        if (!inJob) throw new InvalidOperationException("Assigned synthetic parent not contained");
        ParentExplicitlyAssigned = true;
        uint prior = ResumeThread(parentThread);
        Require("ResumeThread(parent)", prior != 0xFFFFFFFF, ParentPid, "previousSuspendCount=" + prior);
        parentSuspended = false;
        if (prior != 1) throw new InvalidOperationException("Unexpected suspend count=" + prior);
      } catch {
        // This exact CreateProcess handle belongs to the synthetic probe. Release it to its natural TTL.
        if (parentSuspended && Valid(parentThread)) {
          uint prior = ResumeThread(parentThread);
          bool released = prior != 0xFFFFFFFF;
          Record("ResumeThread(pre-launch failure cleanup)", released, released ? 0 : Marshal.GetLastWin32Error(), ParentPid,
            "cooperative probe TTL; exact owned thread handle");
          if (released) parentSuspended = false;
        }
        throw;
      } finally {
        if (Valid(parentThread)) {
          bool closed = CloseHandle(parentThread);
          Record("CloseHandle(parent thread)", closed, closed ? 0 : Marshal.GetLastWin32Error(), ParentPid, "owned thread handle");
          if (!closed) HandleCleanupSucceeded = false;
          parentThread = IntPtr.Zero;
        }
      }
    }

    public int[] ReadJobMembers() {
      for (int capacity=8; capacity<=128; capacity*=2) {
        int size = 8 + capacity * IntPtr.Size;
        IntPtr buffer = Marshal.AllocHGlobal(size);
        try {
          int returned;
          bool ok = QueryJobPids(job, JobObjectBasicProcessIdList, buffer, size, out returned);
          int error = ok ? 0 : Marshal.GetLastWin32Error();
          Record("QueryInformationJobObject(JobObjectBasicProcessIdList)", ok, error, 0,
            "capacity=" + capacity + "; returned=" + returned);
          if (!ok) {
            if (error == 122) continue;
            throw new InvalidOperationException("Job member query failed; Win32=" + error);
          }
          int assigned = Marshal.ReadInt32(buffer, 0), inList = Marshal.ReadInt32(buffer, 4);
          if (assigned != inList || inList < 0 || inList > capacity) continue;
          int[] pids = new int[inList];
          for (int i=0; i<inList; i++) pids[i] = unchecked((int)Marshal.ReadIntPtr(buffer, 8+i*IntPtr.Size).ToInt64());
          return pids;
        } finally { Marshal.FreeHGlobal(buffer); }
      }
      throw new InvalidOperationException("Job member list incomplete or changing");
    }

    public MemberObservation InspectMember(int pid) {
      MemberObservation result = new MemberObservation(); result.Pid = pid;
      IntPtr handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, false, (uint)pid);
      result.Opened = Valid(handle);
      result.OpenError = result.Opened ? 0 : Marshal.GetLastWin32Error();
      Record("OpenProcess(member read-only)", result.Opened, result.OpenError, pid, "query and synchronize only");
      if (!result.Opened) return result;
      try {
        result.CreationFileTimeUtc = Creation(handle);
        Record("GetProcessTimes(member)", result.CreationFileTimeUtc != 0,
          result.CreationFileTimeUtc == 0 ? Marshal.GetLastWin32Error() : 0, pid,
          "creationFileTimeUtc=" + result.CreationFileTimeUtc);
        StringBuilder path = new StringBuilder(32768); int length = path.Capacity;
        result.ImageQuerySucceeded = QueryFullProcessImageName(handle, 0, path, ref length);
        result.ImageError = result.ImageQuerySucceeded ? 0 : Marshal.GetLastWin32Error();
        result.ImagePath = result.ImageQuerySucceeded ? path.ToString() : null;
        Record("QueryFullProcessImageNameW(member)", result.ImageQuerySucceeded, result.ImageError, pid, "read-only image query");
        bool inJob;
        result.MembershipQuerySucceeded = IsProcessInJob(handle, job, out inJob);
        result.MembershipError = result.MembershipQuerySucceeded ? 0 : Marshal.GetLastWin32Error();
        result.InJob = result.MembershipQuerySucceeded && inJob;
        Record("IsProcessInJob(member)", result.MembershipQuerySucceeded, result.MembershipError, pid, "read-only membership query");
        return result;
      } finally {
        bool closed = CloseHandle(handle);
        Record("CloseHandle(member query handle)", closed, closed ? 0 : Marshal.GetLastWin32Error(), pid,
          "read-only member handle");
        if (!closed) HandleCleanupSucceeded = false;
      }
    }

    public bool WaitForOwnedParent(int milliseconds) {
      if (!Valid(parent)) return false;
      uint result = WaitForSingleObject(parent, (uint)milliseconds);
      Record("WaitForSingleObject(owned parent)", result != WAIT_FAILED, result == WAIT_FAILED ? Marshal.GetLastWin32Error() : 0,
        ParentPid, "result=" + result + "; boundMs=" + milliseconds);
      return result == WAIT_OBJECT_0;
    }

    public bool OriginalOwnedParentStillPresent() {
      if (ParentPid <= 0 || ParentCreationFileTimeUtc == 0) return false;
      IntPtr handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, false, (uint)ParentPid);
      if (!Valid(handle)) {
        int error = Marshal.GetLastWin32Error();
        Record("OpenProcess(original parent verification)", false, error, ParentPid,
          "original process not queryable");
        throw new InvalidOperationException("Original parent verification failed; Win32=" + error);
      }
      try {
        bool sameAndAlive = Creation(handle) == ParentCreationFileTimeUtc && WaitForSingleObject(handle, 0) == WAIT_TIMEOUT;
        Record("OriginalParentIdentityAndLiveness", true, 0, ParentPid, "sameCreationAndAlive=" + sameAndAlive);
        return sameAndAlive;
      } finally {
        bool closed = CloseHandle(handle);
        Record("CloseHandle(original parent verification)", closed, closed ? 0 : Marshal.GetLastWin32Error(), ParentPid,
          "read-only verification handle");
        if (!closed) HandleCleanupSucceeded = false;
      }
    }

    public bool TerminateVerifiedOwnedParentOnly() {
      if (!Valid(parent) || ParentPid <= 0 || ParentCreationFileTimeUtc == 0 || Creation(parent) != ParentCreationFileTimeUtc)
        throw new InvalidOperationException("Exact owned parent identity could not be reverified for targeted cleanup");
      if (WaitForSingleObject(parent, 0) == WAIT_OBJECT_0) return true;
      bool ok = TerminateProcess(parent, 97);
      Record("TerminateProcess(exact owned parent only)", ok, ok ? 0 : Marshal.GetLastWin32Error(), ParentPid,
        "targeted cleanup after cooperative timeout; never diagnostic PASS");
      return ok;
    }

    public void Dispose() {
      if (Valid(parentThread)) {
        bool closed = CloseHandle(parentThread);
        Record("CloseHandle(parent thread)", closed, closed ? 0 : Marshal.GetLastWin32Error(), ParentPid, "owned thread handle");
        if (!closed) HandleCleanupSucceeded = false;
        parentThread = IntPtr.Zero;
      }
      if (Valid(parent)) {
        bool closed = CloseHandle(parent);
        Record("CloseHandle(parent process)", closed, closed ? 0 : Marshal.GetLastWin32Error(), ParentPid, "owned process handle");
        if (!closed) HandleCleanupSucceeded = false;
        parent = IntPtr.Zero;
      }
      // Kill-on-close was never configured; this does not terminate an unidentified Job member.
      if (Valid(job)) {
        bool closed = CloseHandle(job);
        Record("CloseHandle(non-destructive Job)", closed, closed ? 0 : Marshal.GetLastWin32Error(), 0,
          "zero Job limit flags verified before child creation");
        if (!closed) HandleCleanupSucceeded = false;
        job = IntPtr.Zero;
      }
    }
  }
}
