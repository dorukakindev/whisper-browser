# 428 — Arka plan ayırmada CPU/GPU durumu

Kullanıcı müzik/arka plan ayırmanın GPU kullanıp kullanamayacağını sordu. Ürün veya ortam değiştirilmedi.

Yerel backend/separator-venv ortamında salt okunur sorgu: ONNX Runtime 1.20.1, providers=['AzureExecutionProvider','CPUExecutionProvider']; CUDAExecutionProvider yok. requirements-separator.lock CPU onnxruntime==1.20.1 içeriyor. prepare_background.py, Audio Separator ve UVR_MDXNET_KARA_2.onnx kullanır; bu kurulumda ayırma CPU'dadır. VoxCPM2'nin GPU kullanması bu ayrı ortamı otomatik CUDA yapmaz.

Audio Separator GPU/CUDA destekler: https://github.com/nomadkaraoke/python-audio-separator . Uyumlu onnxruntime-gpu ve CUDA/cuDNN bağımlılıkları ayrı ortamda kurulup gerçek ayırma ile doğrulanmalıdır. Provider listesinde CUDA görünmesi tek başına başarılı GPU oturumu veya hız kanıtı değildir. Bu tur kurulum, model üretimi veya hız karşılaştırması yapılmadı. Yeni varsayılan veya bağımlılık eklenmedi.
