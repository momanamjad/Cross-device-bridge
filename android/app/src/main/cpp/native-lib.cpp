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

    __android_log_print(ANDROID_LOG_INFO, LOG_TAG, "Starting Node.js event loop...");
    // Start Node.js using the correct namespace function
    node::Start(argc, argv.data());
}
