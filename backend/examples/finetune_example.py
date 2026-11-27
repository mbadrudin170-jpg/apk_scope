"""Contoh fine-tune LLM dengan QLoRA (butuh GPU).

Jalankan:
    pip install transformers peft trl datasets bitsandbytes accelerate
    python backend/examples/finetune_example.py
"""
from __future__ import annotations

from datasets import load_dataset
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
from trl import SFTTrainer

BASE = "Qwen/Qwen2.5-1.5B"


def main() -> None:
    tokenizer = AutoTokenizer.from_pretrained(BASE)
    model = AutoModelForCausalLM.from_pretrained(BASE, load_in_4bit=True)

    lora = LoraConfig(r=16, lora_alpha=32, target_modules=["q_proj", "v_proj"])
    model = get_peft_model(model, lora)

    data = load_dataset("json", data_files="data.jsonl")["train"]

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=data,
        args=TrainingArguments(
            output_dir="./out",
            num_train_epochs=1,
            per_device_train_batch_size=2,
            gradient_accumulation_steps=4,
            learning_rate=2e-4,
        ),
    )
    trainer.train()
    model.save_pretrained("./out")
    tokenizer.save_pretrained("./out")


if __name__ == "__main__":
    main()
