#!/usr/bin/env python3
"""
Extract Template Differences

Analyzes original templates vs reference templates to extract unique files
and generate proper YAML configurations with exact patches.
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Any, Set
import yaml


class TemplateDifferenceExtractor:
    """Extracts differences between original templates and references"""
    
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        self.originals_dir = root_dir / "originals"
        self.reference_dir = root_dir / "reference"
        self.definitions_dir = root_dir / "definitions"
        
        # Template to reference mapping
        self.template_mapping = {
            "c-code-react-runner": "react-reference",
            "c-code-next-runner": "next-reference", 
            "vite-cfagents-runner": "vite-reference",
            "vite-cf-DO-runner": "vite-reference",
            "vite-cf-DO-KV-runner": "vite-reference"
        }
    
    def get_unique_files(self, original_path: Path, reference_path: Path) -> Set[str]:
        """
        Get files that exist in original but not in reference, or are different.
        """
        unique_files = set()
        
        # Run diff to find differences
        try:
            result = subprocess.run([
                'diff', '-r', '--brief', str(reference_path), str(original_path)
            ], capture_output=True, text=True)
            
            for line in result.stdout.strip().split('\n'):
                if not line:
                    continue
                    
                if line.startswith('Only in ' + str(original_path)):
                    # File only in original
                    parts = line.split(': ')
                    if len(parts) == 2:
                        dir_path = Path(parts[0].replace('Only in ', ''))
                        file_name = parts[1]
                        rel_path = (dir_path / file_name).relative_to(original_path)
                        unique_files.add(str(rel_path))
                        
                elif line.startswith('Files ') and ' differ' in line:
                    # Different files
                    parts = line.replace('Files ', '').replace(' differ', '').split(' and ')
                    if len(parts) == 2:
                        ref_file = Path(parts[0])
                        orig_file = Path(parts[1])
                        if orig_file.is_relative_to(original_path):
                            rel_path = orig_file.relative_to(original_path)
                            unique_files.add(str(rel_path))
                            
        except subprocess.SubprocessError as e:
            print(f"Error running diff: {e}", file=sys.stderr)
        
        return unique_files
    
    def extract_package_json_diff(self, original_path: Path, reference_path: Path) -> Dict[str, Any]:
        """
        Extract exact differences in package.json between original and reference.
        """
        orig_pkg = original_path / "package.json"
        ref_pkg = reference_path / "package.json"
        
        if not orig_pkg.exists() or not ref_pkg.exists():
            return {}
        
        try:
            with open(orig_pkg, 'r') as f:
                orig_data = json.load(f)
            with open(ref_pkg, 'r') as f:
                ref_data = json.load(f)
            
            # Find differences
            patches = {}
            
            # Compare dependencies
            orig_deps = orig_data.get('dependencies', {})
            ref_deps = ref_data.get('dependencies', {})
            
            dep_patches = {}
            for pkg, version in orig_deps.items():
                if pkg not in ref_deps or ref_deps[pkg] != version:
                    dep_patches[pkg] = version
            
            if dep_patches:
                patches['dependencies'] = dep_patches
            
            # Compare devDependencies
            orig_dev_deps = orig_data.get('devDependencies', {})
            ref_dev_deps = ref_data.get('devDependencies', {})
            
            dev_dep_patches = {}
            for pkg, version in orig_dev_deps.items():
                if pkg not in ref_dev_deps or ref_dev_deps[pkg] != version:
                    dev_dep_patches[pkg] = version
            
            if dev_dep_patches:
                patches['devDependencies'] = dev_dep_patches
            
            # Compare other fields
            for field in ['name', 'description', 'version']:
                if field in orig_data and (field not in ref_data or orig_data[field] != ref_data[field]):
                    patches[field] = orig_data[field]
            
            return patches
            
        except (json.JSONDecodeError, FileNotFoundError) as e:
            print(f"Error parsing package.json: {e}", file=sys.stderr)
            return {}
    
    def copy_unique_files(self, template_name: str, unique_files: Set[str]) -> None:
        """
        Copy unique files to the template definition folder.
        """
        original_path = self.originals_dir / template_name
        def_name = template_name.replace('-runner', '-def')
        def_path = self.definitions_dir / def_name
        files_path = def_path / "files"
        
        # Create files directory
        files_path.mkdir(parents=True, exist_ok=True)
        
        for file_rel_path in unique_files:
            src_file = original_path / file_rel_path
            dst_file = files_path / file_rel_path
            
            if src_file.exists():
                # Create parent directories
                dst_file.parent.mkdir(parents=True, exist_ok=True)
                
                if src_file.is_file():
                    shutil.copy2(src_file, dst_file)
                    print(f"Copied unique file: {file_rel_path}")
                elif src_file.is_dir():
                    if dst_file.exists():
                        shutil.rmtree(dst_file)
                    shutil.copytree(src_file, dst_file)
                    print(f"Copied unique directory: {file_rel_path}")
    
    def update_yaml_config(self, template_name: str, package_patches: Dict[str, Any]) -> None:
        """
        Update the YAML configuration with extracted patches.
        """
        def_name = template_name.replace('-runner', '-def')
        yaml_path = self.definitions_dir / def_name / "template.yaml"
        
        if not yaml_path.exists():
            print(f"Warning: YAML config not found: {yaml_path}")
            return
        
        try:
            with open(yaml_path, 'r') as f:
                config = yaml.safe_load(f)
            
            # Update package.json patches
            if package_patches:
                if 'overrides' not in config:
                    config['overrides'] = {}
                config['overrides']['package_json_patches'] = package_patches
            
            # Write updated config
            with open(yaml_path, 'w') as f:
                yaml.dump(config, f, default_flow_style=False, sort_keys=False)
            
            print(f"Updated YAML config for {template_name}")
            
        except (yaml.YAMLError, FileNotFoundError) as e:
            print(f"Error updating YAML config: {e}", file=sys.stderr)
    
    def process_template(self, template_name: str) -> None:
        """
        Process a single template to extract differences.
        """
        print(f"\n=== Processing {template_name} ===")
        
        original_path = self.originals_dir / template_name
        reference_name = self.template_mapping.get(template_name)
        
        if not reference_name:
            print(f"No reference mapping found for {template_name}")
            return
        
        reference_path = self.reference_dir / reference_name
        
        if not original_path.exists():
            print(f"Original template not found: {original_path}")
            return
        
        if not reference_path.exists():
            print(f"Reference template not found: {reference_path}")
            return
        
        # 1. Get unique files
        unique_files = self.get_unique_files(original_path, reference_path)
        print(f"Found {len(unique_files)} unique files/directories")
        for f in sorted(unique_files):
            print(f"  - {f}")
        
        # 2. Extract package.json differences
        package_patches = self.extract_package_json_diff(original_path, reference_path)
        print(f"Package.json patches: {len(package_patches)} fields")
        for field, value in package_patches.items():
            if isinstance(value, dict) and len(value) > 3:
                print(f"  - {field}: {len(value)} items")
            else:
                print(f"  - {field}: {value}")
        
        # 3. Copy unique files
        self.copy_unique_files(template_name, unique_files)
        
        # 4. Update YAML config
        self.update_yaml_config(template_name, package_patches)
    
    def process_all_templates(self) -> None:
        """
        Process all templates to extract differences.
        """
        print("Starting template difference extraction...")
        
        for template_name in self.template_mapping.keys():
            self.process_template(template_name)
        
        print("\n=== Template difference extraction complete ===")


def main():
    root_dir = Path(".").resolve()
    extractor = TemplateDifferenceExtractor(root_dir)
    extractor.process_all_templates()


if __name__ == "__main__":
    main()