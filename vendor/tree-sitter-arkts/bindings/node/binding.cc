#include "tree_sitter/parser.h"
#include <napi.h>

using namespace Napi;

extern "C" TSLanguage * tree_sitter_arkts();

namespace {

/*
  tstag() {
    b2sum -l64 <(printf tree-sitter) <(printf "$1") | \
    awk '{printf "0x" toupper($1) (NR == 1 ? ", " : "\n")}'
  }
  tstag language # => 0x8AF2E5212AD58ABF, 0xD5006CAD83ABBA16
*/
const napi_type_tag LANGUAGE_TYPE_TAG = {
  0x8AF2E5212AD58ABF, 0xD5006CAD83ABBA16
};

Object Init(Env env, Object exports) {
  const TSLanguage *language = tree_sitter_arkts();
  
  // 创建 External（不使用 finalizer）
  napi_value external_value;
  napi_status status = napi_create_external(
    env,
    const_cast<TSLanguage *>(language),
    nullptr,  // finalizer
    nullptr,  // finalizer_hint
    &external_value
  );
  
  if (status != napi_ok) {
    Error::New(env, "Failed to create language external").ThrowAsJavaScriptException();
    return exports;
  }
  
  // 设置类型标签
  status = napi_type_tag_object(env, external_value, &LANGUAGE_TYPE_TAG);
  if (status != napi_ok) {
    Error::New(env, "Failed to set language type tag").ThrowAsJavaScriptException();
    return exports;
  }
  
  // 创建语言对象，包含 language 属性和 name 属性
  Object language_obj = Object::New(env);
  language_obj.Set("language", external_value);
  language_obj.Set("name", String::New(env, "arkts"));
  
  return language_obj;
}

NODE_API_MODULE(tree_sitter_arkts_binding, Init)

}  // namespace

