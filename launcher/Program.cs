using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace XiaoXiaoDeTaLauncher
{
    internal static class Program
    {
        internal const string WindowTitle = "小小的她 · 桌面宠物";
        internal static readonly string DataDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "2026-09-22-girlfriend-desktop-pet");

        internal delegate bool EnumWindowsCallback(IntPtr window, IntPtr parameter);

        [DllImport("user32.dll")]
        internal static extern bool EnumWindows(EnumWindowsCallback callback, IntPtr parameter);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        internal static extern int GetWindowText(IntPtr window, StringBuilder text, int maxCount);

        [DllImport("user32.dll")]
        internal static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

        [DllImport("user32.dll")]
        internal static extern bool IsWindowVisible(IntPtr window);

        internal static bool PetVisible(string runtime)
        {
            bool found = false;
            string expectedPath = Path.GetFullPath(runtime);
            EnumWindows((window, parameter) =>
            {
                if (!IsWindowVisible(window)) return true;
                StringBuilder title = new StringBuilder(256);
                GetWindowText(window, title, title.Capacity);
                if (title.ToString() != WindowTitle) return true;
                uint processId;
                GetWindowThreadProcessId(window, out processId);
                try
                {
                    using (Process owner = Process.GetProcessById((int)processId))
                    {
                        if (string.Equals(owner.MainModule.FileName, expectedPath, StringComparison.OrdinalIgnoreCase))
                        {
                            found = true;
                            return false;
                        }
                    }
                }
                catch { }
                return true;
            }, IntPtr.Zero);
            return found;
        }

        internal static void Log(string message)
        {
            try
            {
                Directory.CreateDirectory(DataDirectory);
                File.AppendAllText(Path.Combine(DataDirectory, "launcher.log"),
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " " + message + Environment.NewLine,
                    Encoding.UTF8);
            }
            catch { }
        }

        internal static string RuntimePath()
        {
            string directory = AppDomain.CurrentDomain.BaseDirectory;
            string runtime = Path.Combine(directory, "XiaoXiaoDeTa-runtime.exe");
            if (File.Exists(runtime)) return runtime;
            // The development probe runs next to the unmodified Electron executable.
            return Path.Combine(directory, "小小的她.exe");
        }

        internal static string Quote(string value)
        {
            if (value.Length == 0) return "\"\"";
            StringBuilder result = new StringBuilder("\"");
            int slashes = 0;
            foreach (char character in value)
            {
                if (character == '\\') { slashes += 1; continue; }
                if (character == '"')
                {
                    result.Append('\\', slashes * 2 + 1);
                    result.Append('"');
                    slashes = 0;
                    continue;
                }
                result.Append('\\', slashes);
                slashes = 0;
                result.Append(character);
            }
            result.Append('\\', slashes * 2);
            result.Append('"');
            return result.ToString();
        }

        internal static Process StartRuntime(string runtime, string[] args)
        {
            ProcessStartInfo info = new ProcessStartInfo(runtime);
            info.UseShellExecute = false;
            info.WorkingDirectory = Path.GetDirectoryName(runtime);
            if (args.Length > 0) info.Arguments = string.Join(" ", Array.ConvertAll(args, Quote));
            return Process.Start(info);
        }

        [STAThread]
        private static void Main(string[] args)
        {
            string runtime = RuntimePath();
            if (!File.Exists(runtime))
            {
                MessageBox.Show("桌宠运行文件缺失，请重新下载完整便携包。", "小小的她", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            Log("launcher started");
            if (Array.Exists(args, item => item == "--render-preview"))
            {
                Application.EnableVisualStyles();
                using (StartupForm preview = new StartupForm(runtime, new string[0]))
                using (Bitmap bitmap = new Bitmap(preview.ClientSize.Width, preview.ClientSize.Height))
                {
                    preview.DrawToBitmap(bitmap, new Rectangle(Point.Empty, bitmap.Size));
                    bitmap.Save(Path.Combine(DataDirectory, "launcher-preview.png"));
                }
                return;
            }
            bool commandMode = Array.Exists(args, item => item == "--install-custom-atlas" || item == "--reset-custom-atlas" || item == "--capture");
            if (commandMode)
            {
                try { Environment.ExitCode = StartRuntime(runtime, args).WaitForExitCode(); }
                catch (Exception error) { Log("command failed " + error.Message); Environment.ExitCode = 1; }
                return;
            }

            if (PetVisible(runtime))
            {
                try { StartRuntime(runtime, args); }
                catch (Exception error) { Log("reopen failed " + error.Message); }
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new StartupForm(runtime, args));
        }
    }

    internal static class ProcessExtensions
    {
        internal static int WaitForExitCode(this Process process)
        {
            process.WaitForExit();
            return process.ExitCode;
        }
    }

    internal sealed class StartupForm : Form
    {
        private readonly string runtime;
        private readonly string[] args;
        private readonly System.Windows.Forms.Timer timer;
        private readonly Stopwatch clock = Stopwatch.StartNew();
        private readonly Image image;
        private Process child;
        private bool launchFinished;
        private int visibleTicks;
        private long firstChildExitMs = -1;

        internal StartupForm(string runtimePath, string[] arguments)
        {
            runtime = runtimePath;
            args = arguments;
            FormBorderStyle = FormBorderStyle.None;
            Text = "小小的她 · 正在启动";
            StartPosition = FormStartPosition.Manual;
            ShowInTaskbar = false;
            ShowIcon = false;
            TopMost = true;
            AutoScaleMode = AutoScaleMode.None;
            ClientSize = new Size(250, 310);
            BackColor = Color.FromArgb(255, 250, 247);
            TransparencyKey = BackColor;
            Location = SavedLocation();
            DoubleBuffered = true;
            string imagePath = Path.Combine(Path.GetDirectoryName(runtime), "resources", "assets", "sprites", "idle.png");
            try { if (File.Exists(imagePath)) image = Image.FromFile(imagePath); }
            catch (Exception error) { Program.Log("loading image unavailable " + error.Message); }
            timer = new System.Windows.Forms.Timer();
            timer.Interval = 100;
            timer.Tick += CheckReady;
            Shown += (sender, eventArgs) =>
            {
                Program.Log("loading window shown ms=" + clock.ElapsedMilliseconds);
                timer.Start();
                BeginInvoke(new Action(Launch));
            };
            FormClosed += (sender, eventArgs) => { timer.Stop(); timer.Dispose(); if (image != null) image.Dispose(); };
        }

        protected override bool ShowWithoutActivation { get { return true; } }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams parameters = base.CreateParams;
                parameters.ExStyle |= 0x20 | 0x80 | 0x08000000;
                return parameters;
            }
        }

        private static Point SavedLocation()
        {
            Rectangle area = Screen.PrimaryScreen.WorkingArea;
            int x = area.Right - 290;
            int y = area.Bottom - 350;
            try
            {
                string save = File.ReadAllText(Path.Combine(Program.DataDirectory, "pet-state.json"), Encoding.UTF8);
                Match xMatch = Regex.Match(save, "\"x\"\\s*:\\s*(-?\\d+)");
                Match yMatch = Regex.Match(save, "\"y\"\\s*:\\s*(-?\\d+)");
                if (xMatch.Success && yMatch.Success)
                {
                    x = int.Parse(xMatch.Groups[1].Value);
                    y = int.Parse(yMatch.Groups[1].Value);
                    area = Screen.FromPoint(new Point(x + 125, y + 155)).WorkingArea;
                }
            }
            catch { }
            x = Math.Max(area.Left - 100, Math.Min(x, area.Right - 100));
            y = Math.Max(area.Top - 100, Math.Min(y, area.Bottom - 100));
            return new Point(x, y);
        }

        private void Launch()
        {
            ThreadPool.QueueUserWorkItem(state =>
            {
                try
                {
                    Process started = Program.StartRuntime(runtime, args);
                    Post(() => { child = started; launchFinished = true; Program.Log("runtime process started ms=" + clock.ElapsedMilliseconds); });
                }
                catch (Exception error)
                {
                    Post(() =>
                    {
                        launchFinished = true;
                        Program.Log("runtime start failed " + error.Message);
                        Environment.ExitCode = 1;
                        Close();
                        MessageBox.Show("桌宠启动失败，请检查便携包是否完整。", "小小的她", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    });
                }
            });
        }

        private void Post(Action action)
        {
            try { if (!IsDisposed && IsHandleCreated) BeginInvoke(action); }
            catch (InvalidOperationException) { }
        }

        private void CheckReady(object sender, EventArgs args)
        {
            if (Program.PetVisible(runtime))
            {
                visibleTicks += 1;
                if (visibleTicks >= 3)
                {
                    Program.Log("pet visible ms=" + clock.ElapsedMilliseconds);
                    Close();
                }
                return;
            }
            visibleTicks = 0;
            if (launchFinished && child != null && child.HasExited)
            {
                if (firstChildExitMs < 0) firstChildExitMs = clock.ElapsedMilliseconds;
                if (clock.ElapsedMilliseconds - firstChildExitMs > 5000)
                {
                    Program.Log("runtime exited before window code=" + child.ExitCode);
                    Environment.ExitCode = 1;
                    Close();
                    MessageBox.Show("桌宠没有成功打开，请查看 launcher.log 和 desktop-pet.log。", "小小的她", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            else if (clock.ElapsedMilliseconds > 60000)
            {
                Program.Log("startup timed out");
                Environment.ExitCode = 1;
                Close();
                MessageBox.Show("桌宠启动超时，请查看 launcher.log 和 desktop-pet.log。", "小小的她", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        protected override void OnPaint(PaintEventArgs eventArgs)
        {
            base.OnPaint(eventArgs);
            Graphics graphics = eventArgs.Graphics;
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            if (image != null) graphics.DrawImage(image, new Rectangle(10, 80, 230, 230));
            using (GraphicsPath bubble = new GraphicsPath())
            {
                bubble.AddArc(48, 7, 18, 18, 180, 90);
                bubble.AddArc(184, 7, 18, 18, 270, 90);
                bubble.AddArc(184, 35, 18, 18, 0, 90);
                bubble.AddArc(48, 35, 18, 18, 90, 90);
                bubble.CloseFigure();
                using (SolidBrush fill = new SolidBrush(Color.FromArgb(250, 255, 250, 251))) graphics.FillPath(fill, bubble);
                using (Pen border = new Pen(Color.FromArgb(228, 198, 206), 1)) graphics.DrawPath(border, bubble);
            }
            using (Font font = new Font("Microsoft YaHei UI", 10, FontStyle.Regular, GraphicsUnit.Point))
            using (SolidBrush text = new SolidBrush(Color.FromArgb(116, 73, 86)))
                graphics.DrawString("正在醒来…", font, text, new PointF(83, 20));
        }
    }
}
