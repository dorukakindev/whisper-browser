using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
[assembly:System.Reflection.AssemblyTitle("Whisper Browser")]
[assembly:System.Reflection.AssemblyDescription("Whisper Browser local installation launcher")]
[assembly:System.Reflection.AssemblyVersion("0.9.0.0")]
class WhisperLauncher {
 [STAThread] static int Main(string[] args) {
  try {
   string root=AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
   string exe=Path.Combine(root,"node_modules","electron","dist","electron.exe");
   if(!File.Exists(exe)||!File.Exists(Path.Combine(root,"src","main.js")))throw new Exception("Whisper Browser kurulum dosyaları bulunamadı. EXE dosyasını Whisper Local klasöründe tutun.");
   var info=new ProcessStartInfo(exe,"\""+root+"\""){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden};
   info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
   string libraries=Path.Combine(root,"backend","venv","Lib","site-packages");
   string variable=info.EnvironmentVariables["PATH"]??"";
   foreach(string relative in new[]{"torch\\lib","nvidia\\cudnn\\bin","nvidia\\cublas\\bin"}){string item=Path.Combine(libraries,relative);if(Directory.Exists(item))variable=item+";"+variable;}
   string tools=Path.Combine(root,"backend","bin");if(Directory.Exists(tools))variable=tools+";"+variable;
   info.EnvironmentVariables["PATH"]=variable;
   foreach(string key in new[]{"HF_HUB_DISABLE_SYMLINKS_WARNING","HF_HUB_DISABLE_PROGRESS_BARS","TRANSFORMERS_NO_ADVISORY_WARNINGS"})info.EnvironmentVariables[key]="1";
   info.EnvironmentVariables["TRANSFORMERS_VERBOSITY"]="error";
   info.EnvironmentVariables["PYTHONWARNINGS"]="ignore::UserWarning";
   if(args.Length==2&&args[0]=="--diagnose"){File.WriteAllText(args[1],"root="+root+Environment.NewLine+"electron="+exe+Environment.NewLine+"gpuPath="+variable);return 0;}
   Process started=Process.Start(info);if(args.Length==2&&args[0]=="--launch-report")File.WriteAllText(args[1],started.Id.ToString(System.Globalization.CultureInfo.InvariantCulture));return 0;
  }catch(Exception error){MessageBox.Show(error.Message,"Whisper Browser",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
 }
}
