// test at https://peggyjs.org/online.html

//{{ }}	    for interpolation
//{{= }}	for interpolation
//{{# }}	for compile-time evaluation/includes and partials
//{%? %}	for conditionals
//{%each %}	for array iteration
//{%with %}

Template = Chunk*

Chunk = "$" val:PathNoWs { return val; }
  / "{{" _ val:Expr _ "}}" { return { type: 'expr', val }; }
  / [^${}] 

Expr = left:Value _ op:Op _ right:Expr { return { left, right, op }; }
      / data:Value filters:(_ "|" _ Call)+ { return {data, filters: filters.map((c) => c[3])}; }
      / Value
 
 Op = "||" / "&&"
 
 
 Value "value"
 = val:String  { return {type: 'str', content: val}; }
 / val:Integer { return {type: 'int', content: val}; }
 / val:Path
 / val:Call
 / val:Id      { return {type: 'id',  content: val}; }
 
PathNoWs
  = val:Id keys:(Lookup)* { return {type: 'lookup', val, keys: keys.map((k) => k[1])} }

LookupNoWs
  = "." key:Id       { return key; }
  / "[" key:Expr "]" { return key; }

Path "path"
  = val:Id keys:(_ Lookup)+ { return {type: 'lookup', val, keys: keys.map((k) => k[1])} }
  
Lookup
  = "." _ key:Id         { return key; }
  / "[" _ key:Expr _ "]" { return key; }

Call "call"
  = name:Id __ args:FilterArgs { return {type: 'call', name, args}; }
FilterArgs "arguments"
  = named:FilterKwargs { return { positional: [], named }; }
  /  first:Value rest:(_ "," _ FilterArgs)? {
  		const { named, positional} = rest[3];
  		return { named, positional: [first].concat(positional) };   
     }
FilterKwargs "named arguments"
  = first:FilterKwarg rest:(_ "," _ FilterKwarg)* { return [first].concat(rest.map((r) => r[3])); }
FilterKwarg "named argument"
  = k:Id _ "=" _ v:Value { return [k, v]; }

Id "identifier" 
  = [A-Za-z_-]+ { return text() }

String "string"
  = "'" [^']* "'" { return text() }

Integer "integer"
  = "-"? [0-9]+ { return parseInt(text(), 10); }

_ "whitespace"
  = [ \t\n\r]*

__ "token separator"
  = [ \t\n\r]+