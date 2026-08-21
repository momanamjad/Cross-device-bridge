#include <jni.h>
#include <string>
#include <vector>
#include <unistd.h>
#include <android/log.h>
#include <thread>
#include <fstream>

#define LOG_TAG "NodeJS-Native"

// Forward declaration of Node's start function in the node namespace
namespace node {
    int Start(int argc, char* argv[]);
}

// Pipe file descriptors and reading thread
int pfd[2];
std::thread log_thread;
std::string log_file_path;

void start_logger_thread() {
    ssize_t rsize;
    char buf[1024];
    std::ofstream log_file;
    if (!log_file_path.empty()) {
        log_file.open(log_file_path, std::ios::out | std::ios::app);
    }
    // Read from the pipe and print to Android logcat and log file
    while ((rsize = read(pfd[0], buf, sizeof(buf) - 1)) > 0) {
        buf[rsize] = '\0';
        __android_log_print(ANDROID_LOG_INFO, LOG_TAG, "%s", buf);
        if (log_file.is_open()) {
            log_file << buf;
            log_file.flush();
        }
    }
}

extern "C" JNIEXPORT void JNICALL
Java_com_momanamjad_smsbridge_service_NodeJsServerService_nodeJsStart(
        JNIEnv* env,
        jobject /* this */,
        jobjectArray argsObj,
        jstring logPathObj) {

    // Retrieve log file path
    const char* logPathChars = env->GetStringUTFChars(logPathObj, nullptr);
    log_file_path = logPathChars;
    env->ReleaseStringUTFChars(logPathObj, logPathChars);

    // Set stdout and stderr to line-buffered mode
    setvbuf(stdout, nullptr, _IOLBF, 0);
    setvbuf(stderr, nullptr, _IOLBF, 0);

    // Create a pipe and redirect stdout (1) and stderr (2) to the write-end of the pipe (pfd[1])
    pipe(pfd);
    dup2(pfd[1], STDOUT_FILENO);
    dup2(pfd[1], STDERR_FILENO);

    // Start a thread to read from the pipe and log to Android logcat
    log_thread = std::thread(start_logger_thread);
    log_thread.detach(); // Detach to prevent terminate() exception

    jsize argc = env->GetArrayLength(argsObj);
    std::vector<std::string> argsStr;
    std::vector<char*> argv;

    // Convert Java String array to C-style argv
    for (jsize i = 0; i < argc; ++i) {
        jstring argObj = (jstring)env->GetObjectArrayElement(argsObj, i);
        const char* argChars = env->GetStringUTFChars(argObj, nullptr);
        argsStr.push_back(argChars);
        env->ReleaseStringUTFChars(argObj, argChars);
    }

    for (auto& arg : argsStr) {
        argv.push_back(&arg[0]);
    }
    argv.push_back(nullptr); // Null-terminate argv according to standards

    // Start Node.js using the correct namespace function
    node::Start(argc, argv.data());
}
