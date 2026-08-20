cmake_minimum_required(VERSION 3.22.1)
project("smsbridge")

# Declare libnode.so as an imported shared library
add_library(node SHARED IMPORTED)
set_target_properties(node PROPERTIES IMPORTED_LOCATION
        ${CMAKE_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/libnode.so)

# Create the node-bridge JNI library
add_library(node-bridge SHARED native-lib.cpp)

# Find Android Log library
find_library(log-lib log)

# Link node-bridge with libnode.so and the log library
target_link_libraries(node-bridge
        node
        ${log-lib})
