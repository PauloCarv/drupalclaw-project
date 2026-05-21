---
name: drupal-module
description: Scaffolds a new custom Drupal module with base structure.
distribution: public
---

# drupal-module

Creates a new custom module with base files.

## Steps

1. Ask for module name (if not provided):
   - If the user included a name in the message, use it.
   - Otherwise, suggest a name and ask.

2. Validate name:
   ```bash
   MODULE_NAME="${1:-my_module}"
   MODULE_NAME=$(echo "$MODULE_NAME" | tr '-' '_' | tr '[:upper:]' '[:lower:]')
   MODULE_DIR="web/modules/custom/$MODULE_NAME"

   if [[ -d "$MODULE_DIR" ]]; then
     echo "⚠ Module $MODULE_NAME already exists at $MODULE_DIR"
     ls -la "$MODULE_DIR"
     exit 0
   fi
   ```

3. Create structure:
   ```bash
   mkdir -p "$MODULE_DIR/src/Controller"
   mkdir -p "$MODULE_DIR/src/Form"
   mkdir -p "$MODULE_DIR/src/Plugin/Block"
   mkdir -p "$MODULE_DIR/templates"
   mkdir -p "$MODULE_DIR/config/install"
   ```

4. Create .info.yml:
   ```bash
   cat > "$MODULE_DIR/$MODULE_NAME.info.yml" << EOF
   name: '$MODULE_NAME'
   type: module
   description: 'Custom module: $MODULE_NAME'
   core_version_requirement: ^10 || ^11
   package: Custom
   EOF
   ```

5. Create .module:
   ```bash
   cat > "$MODULE_DIR/$MODULE_NAME.module" << 'EOF'
   <?php

   /**
    * @file
    * Primary module hooks.
    */
   EOF
   ```

6. Create empty .routing.yml:
   ```bash
   touch "$MODULE_DIR/$MODULE_NAME.routing.yml"
   ```

7. Report:
   ```bash
   echo "✅ Module created at $MODULE_DIR"
   echo "Files:"
   find "$MODULE_DIR" -type f
   echo ""
   echo "To enable: vendor/bin/drush en $MODULE_NAME"
   ```
