using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace DeviceBridgeAudio
{
    class Program
    {
        #region WinMM Interop

        private const int MMSYSERR_NOERROR = 0;
        private const int CALLBACK_FUNCTION = 0x00030000;
        private const int WAVE_FORMAT_PCM = 1;
        private const int WHDR_DONE = 0x00000001;
        private const int WHDR_PREPARED = 0x00000002;

        private const int WIM_DATA = 0x3C0;
        private const int WIM_OPEN = 0x3BE;
        private const int WIM_CLOSE = 0x3BF;

        private const int WOM_DONE = 0x3BD;
        private const int WOM_OPEN = 0x3BB;
        private const int WOM_CLOSE = 0x3BC;

        [StructLayout(LayoutKind.Sequential)]
        public struct WAVEFORMATEX
        {
            public ushort wFormatTag;
            public ushort nChannels;
            public uint nSamplesPerSec;
            public uint nAvgBytesPerSec;
            public ushort nBlockAlign;
            public ushort wBitsPerSample;
            public ushort cbSize;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct WAVEHDR
        {
            public IntPtr lpData;
            public uint dwBufferLength;
            public uint dwBytesRecorded;
            public IntPtr dwUser;
            public uint dwFlags;
            public uint dwLoops;
            public IntPtr lpNext;
            public IntPtr reserved;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        public struct WAVEINCAPS
        {
            public ushort wMid;
            public ushort wPid;
            public uint vDriverVersion;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
            public string szPname;
            public uint dwFormats;
            public ushort wChannels;
            public ushort wReserved1;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        public struct WAVEOUTCAPS
        {
            public ushort wMid;
            public ushort wPid;
            public uint vDriverVersion;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
            public string szPname;
            public uint dwFormats;
            public ushort wChannels;
            public ushort wReserved1;
            public uint dwSupport;
        }

        public delegate void WaveInProc(IntPtr hwi, uint uMsg, IntPtr dwInstance, IntPtr dwParam1, IntPtr dwParam2);
        public delegate void WaveOutProc(IntPtr hwo, uint uMsg, IntPtr dwInstance, IntPtr dwParam1, IntPtr dwParam2);

        [DllImport("winmm.dll", CharSet = CharSet.Auto)]
        public static extern int waveInGetNumDevs();

        [DllImport("winmm.dll", CharSet = CharSet.Auto)]
        public static extern int waveInGetDevCaps(IntPtr uDeviceID, ref WAVEINCAPS pwic, int cbwic);

        [DllImport("winmm.dll")]
        public static extern int waveInOpen(out IntPtr phwi, int uDeviceID, ref WAVEFORMATEX pwfx, WaveInProc dwCallback, IntPtr dwInstance, int fdwOpen);

        [DllImport("winmm.dll")]
        public static extern int waveInPrepareHeader(IntPtr hwi, ref WAVEHDR pwh, int cbwh);

        [DllImport("winmm.dll")]
        public static extern int waveInUnprepareHeader(IntPtr hwi, ref WAVEHDR pwh, int cbwh);

        [DllImport("winmm.dll")]
        public static extern int waveInAddBuffer(IntPtr hwi, ref WAVEHDR pwh, int cbwh);

        [DllImport("winmm.dll")]
        public static extern int waveInStart(IntPtr hwi);

        [DllImport("winmm.dll")]
        public static extern int waveInStop(IntPtr hwi);

        [DllImport("winmm.dll")]
        public static extern int waveInReset(IntPtr hwi);

        [DllImport("winmm.dll")]
        public static extern int waveInClose(IntPtr hwi);

        [DllImport("winmm.dll", CharSet = CharSet.Auto)]
        public static extern int waveOutGetNumDevs();

        [DllImport("winmm.dll", CharSet = CharSet.Auto)]
        public static extern int waveOutGetDevCaps(IntPtr uDeviceID, ref WAVEOUTCAPS pwoc, int cbwoc);

        [DllImport("winmm.dll")]
        public static extern int waveOutOpen(out IntPtr phwo, int uDeviceID, ref WAVEFORMATEX pwfx, WaveOutProc dwCallback, IntPtr dwInstance, int fdwOpen);

        [DllImport("winmm.dll")]
        public static extern int waveOutPrepareHeader(IntPtr hwo, ref WAVEHDR pwh, int cbwh);

        [DllImport("winmm.dll")]
        public static extern int waveOutUnprepareHeader(IntPtr hwo, ref WAVEHDR pwh, int cbwh);

        [DllImport("winmm.dll")]
        public static extern int waveOutWrite(IntPtr hwo, ref WAVEHDR pwh, int cbwh);

        [DllImport("winmm.dll")]
        public static extern int waveOutReset(IntPtr hwo);

        [DllImport("winmm.dll")]
        public static extern int waveOutClose(IntPtr hwo);

        #endregion

        private const int SAMPLE_RATE = 16000;
        private const int BITS_PER_SAMPLE = 16;
        private const int CHANNELS = 1;
        private const int BUFFER_COUNT = 4;
        private const int BUFFER_MS = 40; // 40ms packets
        private const int BUFFER_SIZE = (SAMPLE_RATE * (BITS_PER_SAMPLE / 8) * CHANNELS * BUFFER_MS) / 1000; // 1280 bytes

        private static IntPtr hWaveIn = IntPtr.Zero;
        private static IntPtr hWaveOut = IntPtr.Zero;
        private static WaveInProc waveInCallback;
        private static WaveOutProc waveOutCallback;

        private static WAVEHDR[] inHeaders;
        private static IntPtr[] inBuffers;

        private static TcpClient tcpClient = null;
        private static NetworkStream netStream = null;
        private static bool isRunning = true;

        static void Main(string[] args)
        {
            if (args.Length == 0 || args[0] == "--help")
            {
                PrintUsage();
                return;
            }

            if (args[0] == "--list")
            {
                ListDevices();
                return;
            }

            int inDev = -1;
            int outDev = -1;
            int port = -1;
            bool testMode = false;

            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--in" && i + 1 < args.Length)
                {
                    inDev = int.Parse(args[++i]);
                }
                else if (args[i] == "--out" && i + 1 < args.Length)
                {
                    outDev = int.Parse(args[++i]);
                }
                else if (args[i] == "--port" && i + 1 < args.Length)
                {
                    port = int.Parse(args[++i]);
                }
                else if (args[i] == "--test")
                {
                    testMode = true;
                }
            }

            if (testMode)
            {
                RunTest(inDev);
                return;
            }

            if (port <= 0)
            {
                Console.Error.WriteLine("Error: Missing or invalid --port argument.");
                return;
            }

            RunBridge(inDev, outDev, port);
        }

        static void PrintUsage()
        {
            Console.WriteLine("DeviceBridge Audio Utility");
            Console.WriteLine("Usage:");
            Console.WriteLine("  device-audio-bridge.exe --list");
            Console.WriteLine("  device-audio-bridge.exe --test --in <inDevIndex>");
            Console.WriteLine("  device-audio-bridge.exe --in <inDevIndex> --out <outDevIndex> --port <port>");
        }

        static void ListDevices()
        {
            var inputs = new List<string>();
            int inCount = waveInGetNumDevs();
            for (int i = 0; i < inCount; i++)
            {
                WAVEINCAPS caps = new WAVEINCAPS();
                waveInGetDevCaps((IntPtr)i, ref caps, Marshal.SizeOf(caps));
                inputs.Add(string.Format("{{\"id\":{0},\"name\":\"{1}\"}}", i, EscapeJson(caps.szPname)));
            }

            var outputs = new List<string>();
            int outCount = waveOutGetNumDevs();
            for (int i = 0; i < outCount; i++)
            {
                WAVEOUTCAPS caps = new WAVEOUTCAPS();
                waveOutGetDevCaps((IntPtr)i, ref caps, Marshal.SizeOf(caps));
                outputs.Add(string.Format("{{\"id\":{0},\"name\":\"{1}\"}}", i, EscapeJson(caps.szPname)));
            }

            string json = string.Format("{{\"inputs\":[{0}],\"outputs\":[{1}]}}",
                string.Join(",", inputs.ToArray()),
                string.Join(",", outputs.ToArray()));

            Console.WriteLine(json);
        }

        static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Trim();
        }

        static void RunTest(int inDev)
        {
            if (inDev < 0) inDev = 0;
            Console.WriteLine("Starting audio test on input device: " + inDev);

            WAVEFORMATEX wfx = CreateWaveFormat();
            waveInCallback = (hwi, uMsg, dwInstance, dwParam1, dwParam2) =>
            {
                if (uMsg == WIM_DATA && isRunning)
                {
                    WAVEHDR hdr = (WAVEHDR)Marshal.PtrToStructure(dwParam1, typeof(WAVEHDR));
                    if (hdr.dwBytesRecorded > 0)
                    {
                        byte[] buffer = new byte[hdr.dwBytesRecorded];
                        Marshal.Copy(hdr.lpData, buffer, 0, (int)hdr.dwBytesRecorded);

                        // Calculate RMS volume level
                        double sum = 0;
                        int sampleCount = buffer.Length / 2;
                        for (int i = 0; i < buffer.Length; i += 2)
                        {
                            short sample = (short)(buffer[i] | (buffer[i + 1] << 8));
                            sum += sample * sample;
                        }
                        double rms = Math.Sqrt(sum / sampleCount);
                        int bars = (int)(rms / 500);
                        if (bars > 50) bars = 50;

                        Console.Write("\rLevel: [{0}{1}] {2:F0}",
                            new string('#', bars),
                            new string('-', 50 - bars),
                            rms);
                    }

                    // Re-queue buffer
                    waveInAddBuffer(hwi, ref hdr, Marshal.SizeOf(hdr));
                }
            };

            int res = waveInOpen(out hWaveIn, inDev, ref wfx, waveInCallback, IntPtr.Zero, CALLBACK_FUNCTION);
            if (res != MMSYSERR_NOERROR)
            {
                Console.Error.WriteLine("Failed to open waveIn device: " + res);
                return;
            }

            InitInputBuffers();
            waveInStart(hWaveIn);

            Console.WriteLine("\nListening... Press Ctrl+C or Enter to stop.");
            Console.ReadLine();

            isRunning = false;
            waveInStop(hWaveIn);
            waveInReset(hWaveIn);
            waveInClose(hWaveIn);
            Console.WriteLine("\nTest stopped.");
        }

        static void RunBridge(int inDev, int outDev, int port)
        {
            Console.WriteLine(string.Format("Connecting to TCP port {0} (In: {1}, Out: {2})...", port, inDev, outDev));

            try
            {
                tcpClient = new TcpClient();
                tcpClient.Connect("127.0.0.1", port);
                netStream = tcpClient.GetStream();
                Console.WriteLine("Connected to backend TCP bridge.");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Failed to connect to backend TCP: " + ex.Message);
                return;
            }

            WAVEFORMATEX wfx = CreateWaveFormat();

            // Setup audio output (if requested)
            if (outDev >= 0)
            {
                waveOutCallback = (hwo, uMsg, dwInstance, dwParam1, dwParam2) =>
                {
                    if (uMsg == WOM_DONE)
                    {
                        WAVEHDR hdr = (WAVEHDR)Marshal.PtrToStructure(dwParam1, typeof(WAVEHDR));
                        waveOutUnprepareHeader(hwo, ref hdr, Marshal.SizeOf(hdr));
                        if (hdr.lpData != IntPtr.Zero)
                        {
                            Marshal.FreeHGlobal(hdr.lpData);
                        }
                    }
                };

                int outRes = waveOutOpen(out hWaveOut, outDev, ref wfx, waveOutCallback, IntPtr.Zero, CALLBACK_FUNCTION);
                if (outRes != MMSYSERR_NOERROR)
                {
                    Console.Error.WriteLine("Warning: waveOutOpen failed with error: " + outRes);
                }
                else
                {
                    Console.WriteLine("Playback output opened on device: " + outDev);
                    // Start thread to read from TCP stream and write to waveOut
                    Thread outThread = new Thread(PlaybackWorker);
                    outThread.IsBackground = true;
                    outThread.Start();
                }
            }

            // Setup audio input (if requested)
            if (inDev >= 0)
            {
                waveInCallback = (hwi, uMsg, dwInstance, dwParam1, dwParam2) =>
                {
                    if (uMsg == WIM_DATA && isRunning && netStream != null)
                    {
                        WAVEHDR hdr = (WAVEHDR)Marshal.PtrToStructure(dwParam1, typeof(WAVEHDR));
                        if (hdr.dwBytesRecorded > 0)
                        {
                            byte[] buffer = new byte[hdr.dwBytesRecorded];
                            Marshal.Copy(hdr.lpData, buffer, 0, (int)hdr.dwBytesRecorded);

                            try
                            {
                                // Write 2-byte length prefix + PCM payload
                                byte[] lenBytes = BitConverter.GetBytes((ushort)buffer.Length);
                                netStream.Write(lenBytes, 0, 2);
                                netStream.Write(buffer, 0, buffer.Length);
                            }
                            catch
                            {
                                isRunning = false;
                            }
                        }

                        if (isRunning)
                        {
                            waveInAddBuffer(hwi, ref hdr, Marshal.SizeOf(hdr));
                        }
                    }
                };

                int inRes = waveInOpen(out hWaveIn, inDev, ref wfx, waveInCallback, IntPtr.Zero, CALLBACK_FUNCTION);
                if (inRes != MMSYSERR_NOERROR)
                {
                    Console.Error.WriteLine("Warning: waveInOpen failed with error: " + inRes);
                }
                else
                {
                    InitInputBuffers();
                    waveInStart(hWaveIn);
                    Console.WriteLine("Capture input started on device: " + inDev);
                }
            }

            Console.CancelKeyPress += (s, e) =>
            {
                isRunning = false;
                Cleanup();
            };

            while (isRunning && tcpClient.Connected)
            {
                Thread.Sleep(200);
            }

            Cleanup();
        }

        private static void PlaybackWorker()
        {
            byte[] lenBuf = new byte[2];
            while (isRunning && netStream != null)
            {
                try
                {
                    int read = ReadExact(netStream, lenBuf, 0, 2);
                    if (read < 2) break;

                    ushort len = BitConverter.ToUInt16(lenBuf, 0);
                    if (len == 0 || len > 8192) continue;

                    byte[] pcmBuf = new byte[len];
                    read = ReadExact(netStream, pcmBuf, 0, len);
                    if (read < len) break;

                    // Play chunk
                    if (hWaveOut != IntPtr.Zero)
                    {
                        IntPtr pData = Marshal.AllocHGlobal(len);
                        Marshal.Copy(pcmBuf, 0, pData, len);

                        WAVEHDR hdr = new WAVEHDR();
                        hdr.lpData = pData;
                        hdr.dwBufferLength = len;
                        hdr.dwFlags = 0;

                        waveOutPrepareHeader(hWaveOut, ref hdr, Marshal.SizeOf(hdr));
                        waveOutWrite(hWaveOut, ref hdr, Marshal.SizeOf(hdr));
                    }
                }
                catch
                {
                    break;
                }
            }
        }

        private static int ReadExact(NetworkStream stream, byte[] buffer, int offset, int count)
        {
            int totalRead = 0;
            while (totalRead < count)
            {
                int r = stream.Read(buffer, offset + totalRead, count - totalRead);
                if (r <= 0) return totalRead;
                totalRead += r;
            }
            return totalRead;
        }

        private static WAVEFORMATEX CreateWaveFormat()
        {
            WAVEFORMATEX wfx = new WAVEFORMATEX();
            wfx.wFormatTag = WAVE_FORMAT_PCM;
            wfx.nChannels = CHANNELS;
            wfx.nSamplesPerSec = SAMPLE_RATE;
            wfx.wBitsPerSample = BITS_PER_SAMPLE;
            wfx.nBlockAlign = (ushort)(CHANNELS * (BITS_PER_SAMPLE / 8));
            wfx.nAvgBytesPerSec = wfx.nSamplesPerSec * wfx.nBlockAlign;
            wfx.cbSize = 0;
            return wfx;
        }

        private static void InitInputBuffers()
        {
            inHeaders = new WAVEHDR[BUFFER_COUNT];
            inBuffers = new IntPtr[BUFFER_COUNT];

            for (int i = 0; i < BUFFER_COUNT; i++)
            {
                inBuffers[i] = Marshal.AllocHGlobal(BUFFER_SIZE);
                inHeaders[i] = new WAVEHDR();
                inHeaders[i].lpData = inBuffers[i];
                inHeaders[i].dwBufferLength = BUFFER_SIZE;
                inHeaders[i].dwFlags = 0;

                waveInPrepareHeader(hWaveIn, ref inHeaders[i], Marshal.SizeOf(inHeaders[i]));
                waveInAddBuffer(hWaveIn, ref inHeaders[i], Marshal.SizeOf(inHeaders[i]));
            }
        }

        private static void Cleanup()
        {
            isRunning = false;
            try
            {
                if (hWaveIn != IntPtr.Zero)
                {
                    waveInStop(hWaveIn);
                    waveInReset(hWaveIn);
                    for (int i = 0; i < BUFFER_COUNT; i++)
                    {
                        if (inBuffers != null && inBuffers[i] != IntPtr.Zero)
                        {
                            waveInUnprepareHeader(hWaveIn, ref inHeaders[i], Marshal.SizeOf(inHeaders[i]));
                            Marshal.FreeHGlobal(inBuffers[i]);
                            inBuffers[i] = IntPtr.Zero;
                        }
                    }
                    waveInClose(hWaveIn);
                    hWaveIn = IntPtr.Zero;
                }

                if (hWaveOut != IntPtr.Zero)
                {
                    waveOutReset(hWaveOut);
                    waveOutClose(hWaveOut);
                    hWaveOut = IntPtr.Zero;
                }

                if (netStream != null) netStream.Close();
                if (tcpClient != null) tcpClient.Close();
            }
            catch { }
        }
    }
}
