const cmd = await new Deno.Command("./binaries/ir.exe", {
  args: ["ir", "build", "--resource-folder", "./resources", "bytecode/streq.bc", "--output", "out.sb3"],
}).output();

const td = new TextDecoder();
console.log(td.decode(cmd.stdout));
console.log(td.decode(cmd.stderr));