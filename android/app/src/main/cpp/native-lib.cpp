#include <jni.h>
#include <string>
#include <vector>
#include <unistd.h>
#include <android/log.h>

#define LOG_TAG "NodeJS-Native"

// Forward declaration of Node's start function in the node namespace
namespace node {
    int Start(int argc, char* argv[]);
}

extern "C" JNIEXPORT void JNICALL
Java_com_momanamjad_smsbridge_service_NodeJsServerService_nodeJsStart(
        JNIEnv* env,
        jobject /* this */,
        jobjectArray argsObj,
        jstring logPathObj) {

    jsize argc = env->GetArrayLength(argsObj);
    std::vector<std::string> argsStr;
    size_t totalLen = 0;

    // Convert Java String array to C-style argv
    for (jsize i = 0; i < argc; ++i) {
        jstring argObj = (jstring)env->GetObjectArrayElement(argsObj, i);
        const char* argChars = env->GetStringUTFChars(argObj, nullptr);
        argsStr.push_back(argChars);
        totalLen += strlen(argChars) + 1;
        env->ReleaseStringUTFChars(argObj, argChars);
    }

    // Allocate contiguous buffer for libuv/Node.js proctitle compatibility
    std::vector<char> contiguousBuffer(totalLen);
    std::vector<char*> argv(argc + 1, nullptr);
    char* currentPtr = contiguousBuffer.data();

    for (jsize i = 0; i < argc; ++i) {
        argv[i] = currentPtr;
        memcpy(currentPtr, argsStr[i].c_str(), argsStr[i].length() + 1);
        currentPtr += argsStr[i].length() + 1;
    }
    argv[argc] = nullptr; // Null-terminate argv

    const char* logPathChars = env->GetStringUTFChars(logPathObj, nullptr);
    if (logPathChars != nullptr && strlen(logPathChars) > 0) {
        freopen(logPathChars, "a", stdout);
        freopen(logPathChars, "a", stderr);
        setvbuf(stdout, nullptr, _IONBF, 0);
        setvbuf(stderr, nullptr, _IONBF, 0);
    }

    __android_log_print(ANDROID_LOG_INFO, LOG_TAG, "Starting Node.js event loop with %d args...", argc);
    // Start Node.js using the correct namespace function
    int exitCode = node::Start(argc, argv.data());
    __android_log_print(ANDROID_LOG_INFO, LOG_TAG, "Node.js event loop ended with exit code: %d", exitCode);

    if (logPathChars != nullptr) {
        env->ReleaseStringUTFChars(logPathObj, logPathChars);
    }
}
