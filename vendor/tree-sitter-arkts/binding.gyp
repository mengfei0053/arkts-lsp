{
  "targets": [
    {
      "target_name": "tree_sitter_arkts_binding",
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "src"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "NAPI_VERSION=<!(node -p \"process.versions.napi\")"
      ],
      "sources": [
        "src/parser.c",
        "src/scanner.c",
        "bindings/node/binding.cc"
      ],
      "cflags_c": [
        "-std=c99"
      ],
      "cflags_cc": [
        "-std=c++20"
      ],
      "xcode_settings": {
        "OTHER_CPLUSPLUSFLAGS": ["-std=c++20", "-stdlib=libc++"],
        "OTHER_CFLAGS": ["-std=c99"]
      },
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "10.7",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++20"
          }
        }],
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "LanguageStandard": "stdcpp20"
            }
          }
        }],
        ["OS=='linux'", {
          "cflags_cc": [
            "-fexceptions"
          ],
          "ldflags": [
            "-fexceptions"
          ]
        }]
      ]
    }
  ]
}

