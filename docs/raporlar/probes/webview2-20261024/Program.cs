using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Text.Json;
using System.Text;
class Probe : Form {
 readonly WebView2 web = new(){Dock=DockStyle.Fill};
 readonly string output; readonly List<object> results = new();
 protected override bool ShowWithoutActivation => true;
 public Probe(string root){output=root;Width=1280;Height=850;Text="Whisper WebView2 research · isolated profile";ShowInTaskbar=false;Controls.Add(web);Shown+=async (_,_)=>await Run();}
 async Task Run(){try{
 var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(output,"profile"));await web.EnsureCoreWebView2Async(env);web.CoreWebView2.Settings.AreHostObjectsAllowed=false;web.CoreWebView2.Settings.IsWebMessageEnabled=false;
 web.CoreWebView2.NewWindowRequested+=(_,e)=>e.Handled=true;
 foreach(var url in new[]{"https://www.ancient-origins.net/news-history-archaeology/liangzhu-cemetery-ritual-platform-00103297"}){
 var loaded=new TaskCompletionSource<CoreWebView2NavigationCompletedEventArgs>();
 void completed(object? sender,CoreWebView2NavigationCompletedEventArgs e)=>loaded.TrySetResult(e);
 web.CoreWebView2.NavigationCompleted+=completed;web.CoreWebView2.Navigate(url);
 try{var nav=await loaded.Task.WaitAsync(TimeSpan.FromSeconds(40));await Task.Delay(3000);
 var data=await web.CoreWebView2.ExecuteScriptAsync("(()=>({url:location.origin+location.pathname,title:document.title,h1:document.querySelector('h1')?.innerText||'',characters:(document.querySelector('article')?.textContent||document.querySelector('main')?.textContent||document.body?.innerText||'').trim().length,challenge:!!document.querySelector('#challenge-running,#challenge-stage,#challenge-form')||/just a moment|checking your browser|verify you are human/i.test(document.title),article:!!document.querySelector('article'),login:!!document.querySelector('input[type=password]')}))()");
 results.Add(new{requested=url,http=nav.HttpStatusCode,success=nav.IsSuccess,error=nav.WebErrorStatus.ToString(),page=JsonSerializer.Deserialize<JsonElement>(data)});
 using(var file=File.Create(Path.Combine(output,results.Count+"-webview2.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,file);
 }catch(Exception e){results.Add(new{requested=url,error=e.GetType().Name});}
 finally{web.CoreWebView2.NavigationCompleted-=completed;}
 }
 var report=JsonSerializer.Serialize(new{kind="standalone-research-not-integrated",runtime=env.BrowserVersionString,engine="WebView2",results});File.WriteAllText(Path.Combine(output,"report.json"),report,Encoding.UTF8);Console.WriteLine(report);
 }catch(Exception e){Console.WriteLine(JsonSerializer.Serialize(new{ok=false,error=e.GetType().Name,message=e.Message}));}finally{web.Dispose();Close();}}
 [STAThread]static void Main(string[] args){ApplicationConfiguration.Initialize();var output=Path.GetFullPath(args[0]);Directory.CreateDirectory(output);Application.Run(new Probe(output));}
}
