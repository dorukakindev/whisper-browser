import ctypes as c,ctypes.wintypes as w,time,json,sys
class Entry(c.Structure):
 _fields_=[('dwSize',w.DWORD),('cntUsage',w.DWORD),('th32ProcessID',w.DWORD),('th32DefaultHeapID',c.c_size_t),('th32ModuleID',w.DWORD),('cntThreads',w.DWORD),('th32ParentProcessID',w.DWORD),('pcPriClassBase',w.LONG),('dwFlags',w.DWORD),('szExeFile',w.WCHAR*260)]
k=c.WinDLL('kernel32',use_last_error=True);k.CreateToolhelp32Snapshot.argtypes=[w.DWORD,w.DWORD];k.CreateToolhelp32Snapshot.restype=w.HANDLE;k.Process32FirstW.argtypes=[w.HANDLE,c.POINTER(Entry)];k.Process32NextW.argtypes=[w.HANDLE,c.POINTER(Entry)];k.CloseHandle.argtypes=[w.HANDLE]
root=int(sys.argv[1]);deadline=time.monotonic()+25
while time.monotonic()<deadline:
 h=k.CreateToolhelp32Snapshot(2,0);e=Entry();e.dwSize=c.sizeof(e);rows=[];more=k.Process32FirstW(h,c.byref(e))
 while more:
  rows.append((int(e.th32ProcessID),int(e.th32ParentProcessID),e.szExeFile));more=k.Process32NextW(h,c.byref(e))
 k.CloseHandle(h);owned={root}
 for _ in range(8):
  before=len(owned);owned.update(pid for pid,parent,name in rows if parent in owned)
  if len(owned)==before:break
 children=[{'pid':pid,'parent':parent,'name':name} for pid,parent,name in rows if pid in owned]
 if any(row['name'].lower()=='ffmpeg.exe' for row in children):
  print(json.dumps({'observed':children}),flush=True);sys.exit(0)
 time.sleep(.02)
print(json.dumps({'observed':[],'timeout':True}),flush=True);sys.exit(2)
