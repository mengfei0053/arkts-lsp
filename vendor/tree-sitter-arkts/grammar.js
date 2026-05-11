/* eslint-disable valid-jsdoc */
const tsGrammar = require('tree-sitter-typescript/typescript/grammar.js');

// extend
module.exports = grammar(tsGrammar, {
  name: 'arkts',

  precedences: ($, previous) => previous.concat([
    [$.call_expression, $.component_statement],
    [$.style_expression, $.statement],
    [$.style_expression, $.statement_block],
  ]),

  rules: {
    // method_signature add decorator
    method_signature: ($) => seq(
      repeat(field('decorator', $.decorator)),
      optional($.accessibility_modifier),
      optional('static'),
      optional($.override_modifier),
      optional('readonly'),
      optional('async'),
      optional(choice('get', 'set', '*')),
      field('name', $._property_name),
      optional('?'),
      $._call_signature,
    ),

    // struct declaration
    struct_declaration: ($) => prec('literal', seq(
      repeat(field('decorator', $.decorator)),
      'struct',
      field('name', optional($._type_identifier)),
      field('body', $.class_body),
    )),

    declaration: ($, previous) => choice(
      previous,
      $.struct_declaration,
    ),

    // ambient add decorator
    ambient_declaration: ($) => seq(
      repeat(field('decorator', $.decorator)),
      'declare',
      choice(
        $.declaration,
        seq('global', $.statement_block),
        seq('module', '.', alias($.identifier, $.property_identifier), ':', $._type, $._semicolon),
      ),
    ),

    // function add decorator
    function_declaration: ($) => prec.right('declaration', seq(
      repeat(field('decorator', $.decorator)),
      optional('async'),
      'function',
      field('name', $.identifier),
      $._call_signature,
      field('body', $.statement_block),
      optional($._automatic_semicolon),
    )),

    /**
     * ArkUI component statement
     *
     * @example:
     * XXXX('test') {
     *   Row()
     * }
     * .width(10)
     */
    component_statement: ($) => prec.right(seq(
      field('function', $.expression),
      field('arguments', $.arguments),
      optional($.statement_block),
      optional($.style_statement),
    )),

    /**
     * ArkUI style statement
     *
     * @example:
     * .width(10)
     * .height(10)
     */
    style_statement: ($) => prec.right(repeat1(seq(
      '.',
      field('function', $.identifier),
      field('arguments', $.arguments),
    ))),

    /**
     * match stateStyles
     *
     * @example:
     * Button()
     *   .normal: {
     *     .backgroundColor(Color.Yellow)
     *   }
     *   focused: {
     *     .backgroundColor(Color.Pink)
     *   }
     */
    style_expression: ($) => prec.left(1, seq(
      '{',
      $.style_statement,
      '}',
    )),

    primary_expression: ($, previous) => choice(
      previous,
      $.style_expression,
    ),

    statement: ($, previous) => choice(
      previous,
      $.component_statement,
      $.style_statement,
    ),
  },
});

