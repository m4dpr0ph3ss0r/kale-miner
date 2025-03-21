GPU ?= 0
OPENCL_VERSION ?= 300

ifneq ($(OS),Windows_NT)
    TARGET = miner
    CXX = g++
    NVCC = nvcc

    COMMON_FLAGS = -O3 -DNDEBUG -ffast-math -funroll-loops -pthread -std=c++17 -Iutils
    GXX_FLAGS = $(COMMON_FLAGS) -march=native -flto
    NVCC_FLAGS = $(COMMON_FLAGS)

    ifneq ($(filter 1 CUDA,$(GPU)),)
        CXXFLAGS = $(GXX_FLAGS) -DGPU=1
        NVCCFLAGS += -DGPU=1
        SRCS = miner.cpp kernel.cu
        OBJS = miner.o kernel.o
        LINKER = $(NVCC)
        LDFLAGS =
    else ifneq ($(filter 2 OPENCL,$(GPU)),)
        CXXFLAGS = $(GXX_FLAGS) -DGPU=2 -DCL_TARGET_OPENCL_VERSION=$(OPENCL_VERSION)
        SRCS = miner.cpp clprog.cpp
        OBJS = miner.o clprog.o
        LINKER = $(CXX)
        ifeq ($(shell uname),Darwin)
            LDFLAGS = -pthread -framework OpenCL
        else
            LDFLAGS = -pthread -lOpenCL
        endif
    else
        CXXFLAGS = $(GXX_FLAGS) -DGPU=0
        SRCS = miner.cpp
        OBJS = miner.o
        LINKER = $(CXX)
        LDFLAGS = -pthread
    endif

    .PHONY: all clean

    all: $(TARGET)

    $(TARGET): $(OBJS)
	    $(LINKER) -o $@ $(OBJS) $(LDFLAGS)

    miner.o: miner.cpp
	    $(CXX) $(CXXFLAGS) -c $< -o $@

    kernel.o: kernel.cu
	    $(NVCC) $(NVCCFLAGS) -c $< -o $@

    clprog.o: clprog.cpp
	    $(CXX) $(CXXFLAGS) -c $< -o $@

    clean:
	    rm -f $(TARGET) miner.o kernel.o clprog.o

else
    TARGET = miner.exe
    CXX = cl
    NVCC = nvcc

    VS_PATH = C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.38.33130
    WINSDK_INCLUDE = C:/Program Files (x86)/Windows Kits/10/Include/10.0.22621.0
    WINSDK_LIB = C:/Program Files (x86)/Windows Kits/10/Lib/10.0.22621.0
    GPU_INCLUDE = C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v12.6/include
    GPU_LIB = C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v12.6/lib/x64

    COMMON_FLAGS = /O2 /DNDEBUG /EHsc /std:c++17 /I"utils" /I"$(VS_PATH)/include" /I"$(WINSDK_INCLUDE)/ucrt" /wd4819
    COMMON_LDFLAGS = /link /LIBPATH:"$(WINSDK_LIB)/um/x64" /LIBPATH:"$(WINSDK_LIB)/ucrt/x64" /LIBPATH:"$(VS_PATH)/lib/x64"
    NVCCFLAGS = -ccbin "cl" -I"$(GPU_INCLUDE)" -Xcompiler /wd4819

    ifeq ($(GPU),CUDA)
        CXXFLAGS = $(COMMON_FLAGS) /I"$(GPU_INCLUDE)" /DGPU=1
        LDFLAGS = $(COMMON_LDFLAGS) /LIBPATH:"$(GPU_LIB)" cudart.lib
        SRCS = miner.cpp kernel.cu
        OBJS = miner.obj kernel.obj
    else ifeq ($(GPU),OPENCL)
        CXXFLAGS = $(COMMON_FLAGS) /I"$(GPU_INCLUDE)" /DGPU=2 /DCL_TARGET_OPENCL_VERSION=$(OPENCL_VERSION)
        LDFLAGS = $(COMMON_LDFLAGS) /LIBPATH:"$(GPU_LIB)" OpenCL.lib
        SRCS = miner.cpp clprog.cpp
        OBJS = miner.obj clprog.obj
    else
        CXXFLAGS = $(COMMON_FLAGS)
        LDFLAGS = $(COMMON_LDFLAGS)
        SRCS = miner.cpp
        OBJS = miner.obj
    endif

    .PHONY: all clean

    all: $(TARGET)

    $(TARGET): $(OBJS)
	    $(CXX) $(OBJS) $(LDFLAGS) /OUT:$(TARGET)

    miner.obj: miner.cpp
	    $(CXX) $(CXXFLAGS) /c $< /Fominer.obj

    ifeq ($(GPU),CUDA)
    kernel.obj: kernel.cu
	    $(NVCC) $(NVCCFLAGS) -c $< -o kernel.obj
    else ifeq ($(GPU),OPENCL)
    clprog.obj: clprog.cpp
	    $(CXX) $(CXXFLAGS) /c $< /Foclprog.obj
    endif

    clean:
	    del /Q $(TARGET) $(OBJS)

endif
