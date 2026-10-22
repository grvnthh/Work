import { motion } from "framer-motion";

export function Loader() {
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.65, 0, 0.35, 1] }}
    >
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-3xl"
          animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative flex flex-col items-center gap-8">
        <motion.div
          className="overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <motion.p
            className="text-[0.7rem] uppercase tracking-[0.5em] text-muted-foreground"
            initial={{ y: 20 }}
            animate={{ y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
          >
            Granth Agrawal
          </motion.p>
        </motion.div>

        <div className="h-px w-40 overflow-hidden bg-white/10">
          <motion.div
            className="h-full w-1/3 bg-white/70"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>
    </motion.div>
  );
}
