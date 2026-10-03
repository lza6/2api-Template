//! [★ PROVIDER 2/4] 模型/工具目录 —— 放你实测到的真实 id
//!
//! 填法：把第 3 步采集到的 id 按分类填进 CATALOG。
//! 每个 id 都应对应上游一个真实的模型/工具。展示名由 id 派生（可改）。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Model {
    pub id: String,
    pub category: String,
    pub name: String,
    pub is_default: bool,
}

/// [改] 上游真实模型/工具目录（分类 → id 列表）
const CATALOG: &[(&str, &[&str])] = &[
    ("general", &["default-model", "another-model"]),
    // ("category", &["id-1", "id-2"]),
];

/// 把 `my-tool-id` 派生成 `My Tool Id`
pub fn prettify(id: &str) -> String {
    id.split(['-', '_'])
        .filter(|s| !s.is_empty())
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[derive(Debug, Clone)]
pub struct ModelRegistry {
    models: Vec<Model>,
    by_id: std::collections::HashMap<String, usize>,
}

impl ModelRegistry {
    pub fn new(default_model: &str) -> Self {
        let mut models = Vec::new();
        for (category, ids) in CATALOG {
            for id in *ids {
                models.push(Model {
                    id: (*id).to_string(),
                    category: (*category).to_string(),
                    name: prettify(id),
                    is_default: *id == default_model,
                });
            }
        }
        if !models.iter().any(|m| m.is_default) {
            models.insert(0, Model {
                id: default_model.to_string(),
                category: "custom".to_string(),
                name: prettify(default_model),
                is_default: true,
            });
        }
        let by_id = models.iter().enumerate().map(|(i, m)| (m.id.clone(), i)).collect();
        Self { models, by_id }
    }

    pub fn all(&self) -> &[Model] { &self.models }
    pub fn len(&self) -> usize { self.models.len() }
    pub fn is_empty(&self) -> bool { self.models.is_empty() }
    pub fn contains(&self, id: &str) -> bool { self.by_id.contains_key(id) }
    pub fn get(&self, id: &str) -> Option<&Model> { self.by_id.get(id).map(|i| &self.models[*i]) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_loads_and_default_present() {
        let r = ModelRegistry::new("default-model");
        assert!(r.contains("default-model"));
        assert!(!r.is_empty());
    }

    #[test]
    fn ids_are_unique() {
        let r = ModelRegistry::new("default-model");
        let mut ids: Vec<_> = r.all().iter().map(|m| m.id.clone()).collect();
        ids.sort();
        let n = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), n);
    }

    #[test]
    fn prettify_works() {
        assert_eq!(prettify("my-tool-id"), "My Tool Id");
    }
}
